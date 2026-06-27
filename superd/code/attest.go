package main

/*
 Build provenance verification for pulled containers.

 The CI attests each image with actions/attest-build-provenance (Sigstore
 bundles, signed via the public-good instance and logged in Rekor). After a
 update on the main release channel, superd resolves the remote digest of each
 image, fetches its bundle from the GitHub attestations API, and verifies it
 against the repo's docker-image.yml workflow identity - before pulling.
*/

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/sigstore/sigstore-go/pkg/bundle"
	"github.com/sigstore/sigstore-go/pkg/root"
	"github.com/sigstore/sigstore-go/pkg/verify"

	sprbus "github.com/spr-networks/sprbus-json"
)

var AttestationRepo = "spr-networks/super"
var AttestationIssuer = "https://token.actions.githubusercontent.com"
var AttestationSANRegex = `^https://github\.com/spr-networks/super/\.github/workflows/docker-image\.yml@`
var AttestationImagePrefix = "ghcr.io/spr-networks/super_"

var PfwAttestationSANRegex = `^https://github\.com/spr-networks/pfw_extension/\.github/workflows/docker-image\.yml@`
var MeshAttestationSANRegex = `^https://github\.com/spr-networks/mesh_extension/\.github/workflows/docker-image\.yml@`

type attestPolicy struct {
	sanRegex string
	//registry attestations (cosign .att artifact) vs the github attestations api
	registry bool
}

var attestPolicies = map[string]attestPolicy{
	"ghcr.io/spr-networks/super_":                                    {AttestationSANRegex, true},
	"ghcr.io/spr-networks/pfw_extension_":                            {PfwAttestationSANRegex, true},
	"ghcr.io/spr-networks/mesh_extension_":                           {MeshAttestationSANRegex, true},
	"containers.plus.supernetworks.org/spr-networks/pfw_extension_":  {PfwAttestationSANRegex, true},
	"containers.plus.supernetworks.org/spr-networks/mesh_extension_": {MeshAttestationSANRegex, true},
}

func attestationPolicyForImage(image string) *attestPolicy {
	for prefix, policy := range attestPolicies {
		if strings.HasPrefix(image, prefix) {
			p := policy
			return &p
		}
	}
	return nil
}

type AttestResult struct {
	Image    string
	Digest   string
	Verified bool
	Error    string `json:",omitempty"`
	Time     string
	Signer   string   `json:",omitempty"`
	Issuer   string   `json:",omitempty"`
	RekorURL string   `json:",omitempty"`
	LogIndex int64    `json:",omitempty"`
	Config   string   `json:",omitempty"`
	Layers   []string `json:",omitempty"`
}

var Attestmtx sync.Mutex
var gAttestResults = map[string]AttestResult{}

var gSigstoreVerifier *verify.Verifier
var gSigstoreVerifierErr error
var sigstoreVerifierOnce sync.Once

// getSigstoreVerifier fetches the Sigstore trusted root via TUF (cached under
// $HOME/.sigstore) and builds a verifier requiring SCT + Rekor inclusion.
func getSigstoreVerifier() (*verify.Verifier, error) {
	sigstoreVerifierOnce.Do(func() {
		trustedMaterial, err := root.FetchTrustedRoot()
		if err != nil {
			gSigstoreVerifierErr = fmt.Errorf("failed to fetch sigstore trusted root: %v", err)
			return
		}
		gSigstoreVerifier, gSigstoreVerifierErr = verify.NewSignedEntityVerifier(trustedMaterial,
			verify.WithSignedCertificateTimestamps(1),
			verify.WithTransparencyLog(1),
			verify.WithObserverTimestamps(1))
	})
	return gSigstoreVerifier, gSigstoreVerifierErr
}

// fetchGithubAttestations returns the Sigstore bundles attached to a digest
// ("sha256:...") in the repo's attestation store.
func fetchGithubAttestations(digest string) ([]json.RawMessage, error) {
	url := "https://api.github.com/repos/" + AttestationRepo + "/attestations/" + digest

	c := http.Client{Timeout: 30 * time.Second}
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("no attestation found for %s", digest)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("attestation api %s: status %d", url, resp.StatusCode)
	}

	data, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	response := struct {
		Attestations []struct {
			Bundle json.RawMessage `json:"bundle"`
		} `json:"attestations"`
	}{}

	err = json.Unmarshal(data, &response)
	if err != nil {
		return nil, err
	}

	bundles := []json.RawMessage{}
	for _, a := range response.Attestations {
		if len(a.Bundle) != 0 {
			bundles = append(bundles, a.Bundle)
		}
	}

	if len(bundles) == 0 {
		return nil, fmt.Errorf("no attestation bundles for %s", digest)
	}

	return bundles, nil
}

// verifyAttestationForDigest verifies that at least one attestation bundle for
// the digest was signed by the repo's docker-image.yml workflow.
func verifyAttestationForDigest(digest string) error {
	return verifyGithubAttestation(digest, AttestationSANRegex)
}

func verifyGithubAttestation(digest, sanRegex string) error {
	digestHex := strings.TrimPrefix(digest, "sha256:")
	digestBytes, err := hex.DecodeString(digestHex)
	if err != nil || len(digestBytes) != 32 {
		return fmt.Errorf("invalid digest %s", digest)
	}

	bundles, err := fetchGithubAttestations("sha256:" + digestHex)
	if err != nil {
		return err
	}

	verifier, err := getSigstoreVerifier()
	if err != nil {
		return err
	}

	certID, err := verify.NewShortCertificateIdentity(AttestationIssuer, "", "", sanRegex)
	if err != nil {
		return err
	}
	policy := verify.NewPolicy(verify.WithArtifactDigest("sha256", digestBytes),
		verify.WithCertificateIdentity(certID))

	for _, raw := range bundles {
		b := bundle.Bundle{}
		if err = b.UnmarshalJSON(raw); err != nil {
			continue
		}
		if _, err = verifier.Verify(&b, policy); err == nil {
			return nil
		}
	}

	return fmt.Errorf("attestation verification failed for %s: %v", digest, err)
}

type dockerImageEntry struct {
	RepoTags    []string
	RepoDigests []string
}

// imageRepoDigest returns the registry manifest digest ("sha256:...") of a
// local image, the digest the build attestation was made for.
func imageRepoDigest(image string) (string, error) {
	info := dockerImageEntry{}
	err := dockerAPIGetJSON("/images/"+image+"/json", &info)
	if err != nil {
		return "", err
	}

	for _, rd := range info.RepoDigests {
		pieces := strings.SplitN(rd, "@", 2)
		if len(pieces) == 2 && strings.HasPrefix(pieces[1], "sha256:") {
			return pieces[1], nil
		}
	}

	return "", fmt.Errorf("no repo digest for image %s (not pulled from a registry?)", image)
}

// composeImages returns the resolved image refs a compose file would pull
func composeImages(composeFile string, target string) ([]string, error) {
	if composeFile == "" {
		composeFile = getDefaultCompose()
	}

	reloadComposeWhitelist()
	composeAllowed := false
	for _, entry := range ComposeAllowList {
		if entry == composeFile {
			composeAllowed = true
			break
		}
	}
	if !composeAllowed {
		return nil, fmt.Errorf("compose file path is not whitelisted")
	}

	args := []string{"compose", "-f", composeFile, "config", "--images"}
	if target != "" {
		args = append(args, target)
	}

	out, err := exec.Command("docker", args...).Output()
	if err != nil {
		out, err = exec.Command("docker-compose", args[1:]...).Output()
		if err != nil {
			return nil, fmt.Errorf("failed to enumerate compose images: %v", err)
		}
	}

	images := []string{}
	for _, line := range strings.Split(string(out), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			images = append(images, line)
		}
	}
	return images, nil
}

// verifyUpdateImages checks build provenance for every SPR image an update
// would pull, before pulling. Returns an error if any image fails, so the
// update can be aborted without downloading the unverified image.
func verifyUpdateImages(composeFile string, target string) error {
	images, err := composeImages(composeFile, target)
	if err != nil {
		return err
	}

	failures := []string{}
	for _, image := range images {
		policy := attestationPolicyForImage(image)
		if policy == nil {
			continue
		}

		result := AttestResult{Image: image, Time: time.Now().UTC().Format(time.RFC3339)}

		digest, err := resolveRemoteDigestAny(image)
		if err == nil {
			result.Digest = digest
			if policy.registry {
				host, repo, _ := splitImageRef(image)
				err = verifyRegistryAttestation(host, repo, digest, policy.sanRegex)
			} else {
				err = verifyGithubAttestation(digest, policy.sanRegex)
			}
		}

		if err != nil {
			result.Error = err.Error()
			failures = append(failures, image+": "+err.Error())
			fmt.Println("[-] attest: verification failed for", image, err)
			sprbus.Publish("superd:attest:failure", map[string]string{"Image": image, "Digest": digest, "Reason": err.Error()})
		} else {
			result.Verified = true
			sprbus.Publish("superd:attest:ok", map[string]string{"Image": image, "Digest": digest})
		}

		Attestmtx.Lock()
		gAttestResults[image] = result
		Attestmtx.Unlock()
	}

	if len(failures) != 0 {
		return fmt.Errorf("provenance verification failed: %s", strings.Join(failures, "; "))
	}

	return nil
}

// verifyPulledImages verifies provenance for all local SPR images and
// publishes the results on the bus.
func verifyPulledImages() {
	images := []dockerImageEntry{}
	err := dockerAPIGetJSON("/images/json", &images)
	if err != nil {
		fmt.Println("[-] attest: failed to list images:", err)
		return
	}

	for _, img := range images {
		tag := ""
		for _, t := range img.RepoTags {
			if attestationPolicyForImage(t) != nil {
				tag = t
				break
			}
		}
		if tag == "" {
			continue
		}
		policy := attestationPolicyForImage(tag)

		digest := ""
		for _, rd := range img.RepoDigests {
			pieces := strings.SplitN(rd, "@", 2)
			if len(pieces) == 2 && strings.HasPrefix(pieces[1], "sha256:") {
				digest = pieces[1]
				break
			}
		}

		result := AttestResult{Image: tag, Digest: digest, Time: time.Now().UTC().Format(time.RFC3339)}
		if digest == "" {
			result.Error = "no repo digest (locally built image)"
		} else if policy.registry {
			host, repo, _ := splitImageRef(tag)
			info, err := verifyRegistryAttestationInfo(host, repo, digest, policy.sanRegex)
			if err != nil {
				result.Error = err.Error()
			} else {
				result.Verified = true
				result.Signer = info.Signer
				result.Issuer = info.Issuer
				result.RekorURL = info.RekorURL
				result.LogIndex = info.LogIndex
				if mi, mErr := fetchManifestInfo(host, repo, digest); mErr == nil {
					result.Config = mi.Config
					result.Layers = mi.Layers
				}
			}
		} else {
			if err := verifyGithubAttestation(digest, policy.sanRegex); err != nil {
				result.Error = err.Error()
			} else {
				result.Verified = true
			}
		}

		Attestmtx.Lock()
		gAttestResults[tag] = result
		Attestmtx.Unlock()

		if result.Verified {
			sprbus.Publish("superd:attest:ok", map[string]string{"Image": tag, "Digest": digest})
		} else {
			fmt.Println("[-] attest: verification failed for", tag, result.Error)
			sprbus.Publish("superd:attest:failure", map[string]string{"Image": tag, "Digest": digest, "Reason": result.Error})
		}
	}
}

func attestStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPut {
		verifyPulledImages()
	}

	Attestmtx.Lock()
	results := []AttestResult{}
	for _, result := range gAttestResults {
		results = append(results, result)
	}
	Attestmtx.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
