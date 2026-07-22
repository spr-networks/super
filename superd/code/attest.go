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
	"os"
	"os/exec"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/sigstore/sigstore-go/pkg/bundle"
	"github.com/sigstore/sigstore-go/pkg/root"
	"github.com/sigstore/sigstore-go/pkg/verify"
	yaml "go.yaml.in/yaml/v3"

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

var pluginImageHosts = map[string]bool{
	"ghcr.io":                           true,
	"containers.plus.supernetworks.org": true,
}

const pluginImageOrg = "spr-networks"

var pluginRepoNameRegex = regexp.MustCompile(`^spr-[a-z0-9._-]+$`)

func pluginAttestPolicy(image string) *attestPolicy {
	if idx := strings.IndexByte(image, '@'); idx != -1 {
		image = image[:idx]
	}

	host, repo, _ := splitImageRef(image)
	if !pluginImageHosts[host] {
		return nil
	}

	idx := strings.LastIndex(repo, "/")
	if idx == -1 {
		return nil
	}
	org := repo[:idx]
	name := repo[idx+1:]

	if org != pluginImageOrg || !pluginRepoNameRegex.MatchString(name) {
		return nil
	}

	sanRegex := `^https://github\.com/` +
		regexp.QuoteMeta(pluginImageOrg+"/"+name) +
		`/\.github/workflows/docker-image\.yml@`

	return &attestPolicy{sanRegex: sanRegex, registry: true}
}

func attestationPolicyForImage(image string) *attestPolicy {
	for prefix, policy := range attestPolicies {
		if strings.HasPrefix(image, prefix) {
			p := policy
			return &p
		}
	}
	return pluginAttestPolicy(image)
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
func verifyUpdateImages(composeFile string, target string) (map[string]string, error) {
	images, err := composeImages(composeFile, target)
	if err != nil {
		return nil, err
	}

	verified := map[string]string{}
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
			if cached, ok := cachedAttest(digest); ok {
				result = cached
				result.Image = image
			} else {
				if policy.registry {
					host, repo, _ := splitImageRef(image)
					err = verifyRegistryAttestation(host, repo, digest, policy.sanRegex)
				} else {
					err = verifyGithubAttestation(digest, policy.sanRegex)
				}
			}
		}

		if err != nil {
			result.Error = err.Error()
			failures = append(failures, image+": "+err.Error())
			fmt.Println("[-] attest: verification failed for", image, err)
			sprbus.Publish("superd:attest:failure", map[string]string{"Image": image, "Digest": digest, "Reason": err.Error()})
		} else {
			result.Verified = true
			verified[image] = digest
			cacheAttestResult(digest, result, false)
			sprbus.Publish("superd:attest:ok", map[string]string{"Image": image, "Digest": digest})
		}

		Attestmtx.Lock()
		gAttestResults[image] = result
		Attestmtx.Unlock()
	}

	if len(failures) != 0 {
		return nil, fmt.Errorf("provenance verification failed: %s", strings.Join(failures, "; "))
	}

	return verified, nil
}

func removeRejectedImage(image string) error {
	out, err := exec.Command("docker", "image", "rm", image).CombinedOutput()
	if err == nil {
		return nil
	}
	detail := strings.TrimSpace(string(out))
	if detail != "" {
		return fmt.Errorf("docker image rm %s: %v: %s", image, err, detail)
	}
	return fmt.Errorf("docker image rm %s: %v", image, err)
}

func rejectPulledImage(image string, digest string, verifyErr error) string {
	reason := verifyErr.Error()
	if err := removeRejectedImage(image); err != nil {
		reason += "; cleanup failed: " + err.Error()
	}
	fmt.Println("[-] attest: pulled image failed verification", image, digest, reason)
	sprbus.Publish("superd:attest:failure", map[string]string{"Image": image, "Digest": digest, "Reason": reason})
	return reason
}

func verifyPulledUpdate(composeFile string, target string, verified map[string]string) error {
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

		digest, err := imageRepoDigest(image)
		if err != nil {
			reason := rejectPulledImage(image, "", err)
			failures = append(failures, image+": "+reason)
			continue
		}

		if verified[image] == digest {
			continue
		}

		if cached, ok := cachedAttest(digest); ok && cached.Verified {
			continue
		}

		if policy.registry {
			host, repo, _ := splitImageRef(image)
			err = verifyRegistryAttestation(host, repo, digest, policy.sanRegex)
		} else {
			err = verifyGithubAttestation(digest, policy.sanRegex)
		}

		if err != nil {
			reason := rejectPulledImage(image, digest, err)
			failures = append(failures, image+": pulled digest "+digest+" failed verification: "+reason)
		}
	}

	if len(failures) != 0 {
		return fmt.Errorf("post-pull verification failed: %s", strings.Join(failures, "; "))
	}

	return nil
}

// verifyPulledImages verifies provenance for all local SPR images and
// publishes the results on the bus.
func verifyPulledImages(force bool) {
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
		if cached, ok := cachedAttest(digest); ok && !force {
			result = cached
			result.Image = tag
		} else if digest == "" {
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

		cacheAttestResult(digest, result, force)

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
		verifyPulledImages(true)
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

func attestImageRemote(image string, force bool) AttestResult {
	result := AttestResult{Image: image, Time: time.Now().UTC().Format(time.RFC3339)}

	policy := attestationPolicyForImage(image)
	if policy == nil {
		if digest, dErr := resolveRemoteDigestAny(image); dErr == nil {
			result.Digest = digest
		}
		result.Error = "no attestation policy for this image"
		return result
	}

	digest, err := resolveRemoteDigestAny(image)
	if err != nil {
		result.Error = err.Error()
		return result
	}
	result.Digest = digest

	if !force {
		if cached, ok := cachedAttest(digest); ok {
			cached.Image = image
			cached.Time = result.Time
			return cached
		}
	}

	if policy.registry {
		host, repo, _ := splitImageRef(image)
		info, iErr := verifyRegistryAttestationInfo(host, repo, digest, policy.sanRegex)
		if iErr != nil {
			result.Error = iErr.Error()
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
		if gErr := verifyGithubAttestation(digest, policy.sanRegex); gErr != nil {
			result.Error = gErr.Error()
		} else {
			result.Verified = true
		}
	}

	if result.Verified {
		cacheAttestResult(digest, result, force)
		Attestmtx.Lock()
		gAttestResults[image] = result
		Attestmtx.Unlock()
		sprbus.Publish("superd:attest:ok", map[string]string{"Image": image, "Digest": digest})
	}
	return result
}

var composeVarRe = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-([^}]*))?\}`)

func expandComposeVars(s string) string {
	return composeVarRe.ReplaceAllStringFunc(s, func(m string) string {
		parts := composeVarRe.FindStringSubmatch(m)
		if v := os.Getenv(parts[1]); v != "" {
			return v
		}
		return parts[2]
	})
}

func parseComposeImages(composeFile, service string) ([]string, error) {
	if composeFile == "" {
		composeFile = getDefaultCompose()
	}

	reloadComposeWhitelist()
	allowed := false
	for _, entry := range ComposeAllowList {
		if entry == composeFile {
			allowed = true
			break
		}
	}
	if !allowed {
		return nil, fmt.Errorf("compose file path is not whitelisted: %s", composeFile)
	}

	data, err := os.ReadFile(composeFile)
	if err != nil {
		return nil, err
	}

	doc := struct {
		Services map[string]struct {
			Image string `yaml:"image"`
		} `yaml:"services"`
	}{}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("failed to parse %s: %v", composeFile, err)
	}

	names := []string{}
	for name := range doc.Services {
		names = append(names, name)
	}
	sort.Strings(names)

	images := []string{}
	for _, name := range names {
		if service != "" && name != service {
			continue
		}
		image := expandComposeVars(doc.Services[name].Image)
		if image != "" {
			images = append(images, image)
		}
	}

	if service != "" && len(images) == 0 {
		return nil, fmt.Errorf("no image for service %s in %s", service, composeFile)
	}

	return images, nil
}

func pluginAttest(w http.ResponseWriter, r *http.Request) {
	compose := r.URL.Query().Get("compose_file")
	service := r.URL.Query().Get("service")
	force := r.URL.Query().Get("force") != ""

	images, err := parseComposeImages(compose, service)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	results := []AttestResult{}
	for _, image := range images {
		results = append(results, attestImageRemote(image, force))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
