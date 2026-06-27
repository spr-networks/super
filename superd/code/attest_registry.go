package main

/*
 Registry-based provenance verification for the plus extensions.

 The extension repos are private, so their attestations are not readable from
 the GitHub attestations API. Their CI signs and attests with cosign instead:
 the SLSA provenance lives in the registry as a sha256-<digest>.att manifest
 whose layer annotations carry the Fulcio certificate and Rekor entry. Those
 parts assemble into a sigstore v0.1 bundle, verified with the same trusted
 root and policies as the github-sourced bundles.
*/

import (
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"

	protobundle "github.com/sigstore/protobuf-specs/gen/pb-go/bundle/v1"
	protocommon "github.com/sigstore/protobuf-specs/gen/pb-go/common/v1"
	protodsse "github.com/sigstore/protobuf-specs/gen/pb-go/dsse"
	protorekor "github.com/sigstore/protobuf-specs/gen/pb-go/rekor/v1"
	"github.com/sigstore/sigstore-go/pkg/bundle"
	"github.com/sigstore/sigstore-go/pkg/verify"
)

var DockerConfigPath = "/root/.docker/config.json"

type regClient struct {
	host  string
	token string
	basic string
	c     http.Client
}

func dockerConfigBasicAuth(host string) string {
	data, err := os.ReadFile(DockerConfigPath)
	if err != nil {
		return ""
	}
	config := struct {
		Auths map[string]struct {
			Auth string `json:"auth"`
		} `json:"auths"`
	}{}
	if json.Unmarshal(data, &config) != nil {
		return ""
	}
	return config.Auths[host].Auth
}

func newRegClient(host, repo string) (*regClient, error) {
	r := &regClient{host: host, c: http.Client{Timeout: 30 * time.Second}}
	r.basic = dockerConfigBasicAuth(host)

	resp, err := r.c.Get("https://" + host + "/v2/")
	if err != nil {
		return nil, err
	}
	resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return r, nil
	}

	challenge := resp.Header.Get("WWW-Authenticate")
	if strings.HasPrefix(challenge, "Basic") {
		if r.basic == "" {
			return nil, fmt.Errorf("registry %s requires credentials", host)
		}
		return r, nil
	}

	realmRe := regexp.MustCompile(`realm="([^"]+)"`)
	serviceRe := regexp.MustCompile(`service="([^"]+)"`)
	realm := realmRe.FindStringSubmatch(challenge)
	service := serviceRe.FindStringSubmatch(challenge)
	if realm == nil {
		return nil, fmt.Errorf("unsupported auth challenge from %s: %s", host, challenge)
	}

	tokenURL := realm[1] + "?scope=repository:" + repo + ":pull"
	if service != nil {
		tokenURL += "&service=" + service[1]
	}

	req, err := http.NewRequest(http.MethodGet, tokenURL, nil)
	if err != nil {
		return nil, err
	}
	if r.basic != "" {
		req.Header.Set("Authorization", "Basic "+r.basic)
	}

	resp2, err := r.c.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp2.Body.Close()

	tokenResponse := struct {
		Token string `json:"token"`
	}{}
	if err := json.NewDecoder(resp2.Body).Decode(&tokenResponse); err != nil {
		return nil, err
	}
	if tokenResponse.Token == "" {
		return nil, fmt.Errorf("no pull token from %s for %s", host, repo)
	}

	r.token = tokenResponse.Token
	return r, nil
}

func (r *regClient) get(path, accept string) (*http.Response, error) {
	req, err := http.NewRequest(http.MethodGet, "https://"+r.host+path, nil)
	if err != nil {
		return nil, err
	}
	if accept != "" {
		req.Header.Set("Accept", accept)
	}
	if r.token != "" {
		req.Header.Set("Authorization", "Bearer "+r.token)
	} else if r.basic != "" {
		req.Header.Set("Authorization", "Basic "+r.basic)
	}
	return r.c.Do(req)
}

func splitImageRef(imageRef string) (host, repo, tag string) {
	tag = "latest"
	pieces := strings.SplitN(imageRef, "/", 2)
	if len(pieces) != 2 {
		return "", "", ""
	}
	host = pieces[0]
	repo = pieces[1]
	if idx := strings.LastIndex(repo, ":"); idx != -1 {
		tag = repo[idx+1:]
		repo = repo[:idx]
	}
	return host, repo, tag
}

// resolveRemoteDigestAny returns the manifest digest of an image ref from its
// registry, without pulling
func resolveRemoteDigestAny(imageRef string) (string, error) {
	host, repo, tag := splitImageRef(imageRef)
	if host == "" {
		return "", fmt.Errorf("invalid image ref %s", imageRef)
	}

	r, err := newRegClient(host, repo)
	if err != nil {
		return "", err
	}

	resp, err := r.get("/v2/"+repo+"/manifests/"+tag, strings.Join([]string{
		"application/vnd.oci.image.index.v1+json",
		"application/vnd.docker.distribution.manifest.list.v2+json",
		"application/vnd.oci.image.manifest.v1+json",
		"application/vnd.docker.distribution.manifest.v2+json",
	}, ", "))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("manifest request for %s: status %d", imageRef, resp.StatusCode)
	}

	digest := resp.Header.Get("Docker-Content-Digest")
	if !strings.HasPrefix(digest, "sha256:") {
		return "", fmt.Errorf("no content digest for %s", imageRef)
	}

	return digest, nil
}

type cosignAttestation struct {
	envelope    []byte
	certPEM     []byte
	chainPEM    []byte
	rekorBundle []byte
}

var errNoAttestation = fmt.Errorf("no registry attestation found")

// fetchRegistryAttestation retrieves the cosign attestation artifact
// (sha256-<digest>.att) for an image digest
func fetchRegistryAttestation(host, repo, digest string) (*cosignAttestation, error) {
	r, err := newRegClient(host, repo)
	if err != nil {
		return nil, err
	}

	tag := "sha256-" + strings.TrimPrefix(digest, "sha256:") + ".att"
	resp, err := r.get("/v2/"+repo+"/manifests/"+tag, "application/vnd.oci.image.manifest.v1+json")
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, errNoAttestation
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("attestation manifest for %s: status %d", digest, resp.StatusCode)
	}

	data, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	manifest := struct {
		Layers []struct {
			MediaType   string            `json:"mediaType"`
			Digest      string            `json:"digest"`
			Annotations map[string]string `json:"annotations"`
		} `json:"layers"`
	}{}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, err
	}

	for _, layer := range manifest.Layers {
		if layer.MediaType != "application/vnd.dsse.envelope.v1+json" {
			continue
		}

		blobResp, err := r.get("/v2/"+repo+"/blobs/"+layer.Digest, "")
		if err != nil {
			return nil, err
		}
		envelope, err := ioutil.ReadAll(blobResp.Body)
		blobResp.Body.Close()
		if err != nil {
			return nil, err
		}

		return &cosignAttestation{
			envelope:    envelope,
			certPEM:     []byte(layer.Annotations["dev.sigstore.cosign/certificate"]),
			chainPEM:    []byte(layer.Annotations["dev.sigstore.cosign/chain"]),
			rekorBundle: []byte(layer.Annotations["dev.sigstore.cosign/bundle"]),
		}, nil
	}

	return nil, errNoAttestation
}

func pemToDER(pemData []byte) [][]byte {
	ders := [][]byte{}
	for {
		block, rest := pem.Decode(pemData)
		if block == nil {
			break
		}
		ders = append(ders, block.Bytes)
		pemData = rest
	}
	return ders
}

// assembleBundle builds a sigstore v0.1 bundle from cosign's registry
// attestation parts (certificate, DSSE envelope, Rekor inclusion promise)
func assembleBundle(att *cosignAttestation) (*bundle.Bundle, error) {
	certs := pemToDER(att.certPEM)
	certs = append(certs, pemToDER(att.chainPEM)...)
	if len(certs) == 0 {
		return nil, fmt.Errorf("attestation has no certificate")
	}

	envelope := struct {
		PayloadType string `json:"payloadType"`
		Payload     string `json:"payload"`
		Signatures  []struct {
			KeyID string `json:"keyid"`
			Sig   string `json:"sig"`
		} `json:"signatures"`
	}{}
	if err := json.Unmarshal(att.envelope, &envelope); err != nil {
		return nil, fmt.Errorf("invalid DSSE envelope: %v", err)
	}
	if len(envelope.Signatures) == 0 {
		return nil, fmt.Errorf("DSSE envelope has no signatures")
	}
	payload, err := base64.StdEncoding.DecodeString(envelope.Payload)
	if err != nil {
		return nil, err
	}
	sig, err := base64.StdEncoding.DecodeString(envelope.Signatures[0].Sig)
	if err != nil {
		return nil, err
	}

	rekor := struct {
		SignedEntryTimestamp []byte `json:"SignedEntryTimestamp"`
		Payload              struct {
			Body           string `json:"body"`
			IntegratedTime int64  `json:"integratedTime"`
			LogIndex       int64  `json:"logIndex"`
			LogID          string `json:"logID"`
		} `json:"Payload"`
	}{}
	if err := json.Unmarshal(att.rekorBundle, &rekor); err != nil {
		return nil, fmt.Errorf("invalid rekor bundle: %v", err)
	}

	body, err := base64.StdEncoding.DecodeString(rekor.Payload.Body)
	if err != nil {
		return nil, err
	}
	logID, err := hex.DecodeString(rekor.Payload.LogID)
	if err != nil {
		return nil, err
	}

	entryKind := struct {
		Kind       string `json:"kind"`
		APIVersion string `json:"apiVersion"`
	}{}
	if err := json.Unmarshal(body, &entryKind); err != nil {
		return nil, fmt.Errorf("invalid rekor entry body: %v", err)
	}

	chain := &protocommon.X509CertificateChain{}
	for _, der := range certs {
		chain.Certificates = append(chain.Certificates, &protocommon.X509Certificate{RawBytes: der})
	}

	pb := &protobundle.Bundle{
		MediaType: "application/vnd.dev.sigstore.bundle+json;version=0.1",
		VerificationMaterial: &protobundle.VerificationMaterial{
			Content: &protobundle.VerificationMaterial_X509CertificateChain{
				X509CertificateChain: chain,
			},
			TlogEntries: []*protorekor.TransparencyLogEntry{{
				LogIndex:          rekor.Payload.LogIndex,
				LogId:             &protocommon.LogId{KeyId: logID},
				KindVersion:       &protorekor.KindVersion{Kind: entryKind.Kind, Version: entryKind.APIVersion},
				IntegratedTime:    rekor.Payload.IntegratedTime,
				InclusionPromise:  &protorekor.InclusionPromise{SignedEntryTimestamp: rekor.SignedEntryTimestamp},
				CanonicalizedBody: body,
			}},
		},
		Content: &protobundle.Bundle_DsseEnvelope{
			DsseEnvelope: &protodsse.Envelope{
				Payload:     payload,
				PayloadType: envelope.PayloadType,
				Signatures:  []*protodsse.Signature{{Sig: sig, Keyid: envelope.Signatures[0].KeyID}},
			},
		},
	}

	return bundle.NewBundle(pb)
}

func verifyRegistryAttestation(host, repo, digest, sanRegex string) error {
	_, err := verifyRegistryAttestationInfo(host, repo, digest, sanRegex)
	return err
}

func verifyRegistryAttestationInfo(host, repo, digest, sanRegex string) (*attestInfo, error) {
	att, err := fetchRegistryAttestation(host, repo, digest)
	if err != nil {
		return nil, err
	}

	b, err := assembleBundle(att)
	if err != nil {
		return nil, err
	}

	verifier, err := getSigstoreVerifier()
	if err != nil {
		return nil, err
	}

	digestBytes, err := hex.DecodeString(strings.TrimPrefix(digest, "sha256:"))
	if err != nil || len(digestBytes) != 32 {
		return nil, fmt.Errorf("invalid digest %s", digest)
	}

	certID, err := verify.NewShortCertificateIdentity(AttestationIssuer, "", "", sanRegex)
	if err != nil {
		return nil, err
	}
	policy := verify.NewPolicy(verify.WithArtifactDigest("sha256", digestBytes),
		verify.WithCertificateIdentity(certID))

	if _, err = verifier.Verify(b, policy); err != nil {
		return nil, fmt.Errorf("attestation verification failed for %s: %v", digest, err)
	}

	info := &attestInfo{
		Signer:   certIdentitySAN(att.certPEM),
		Issuer:   AttestationIssuer,
		LogIndex: rekorLogIndex(att.rekorBundle),
	}
	if info.LogIndex > 0 {
		info.RekorURL = fmt.Sprintf("https://search.sigstore.dev/?logIndex=%d", info.LogIndex)
	}
	return info, nil
}
