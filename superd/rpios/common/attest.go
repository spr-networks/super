package common

/*
 Build provenance of artifacts the CI attests with
 actions/attest-build-provenance: Sigstore bundles, signed through the
 public-good instance and logged in Rekor, found by the artifact's sha256
 in a repository's GitHub attestation store.
*/

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/sigstore/sigstore-go/pkg/bundle"
	"github.com/sigstore/sigstore-go/pkg/root"
	"github.com/sigstore/sigstore-go/pkg/verify"
)

var AttestationIssuer = "https://token.actions.githubusercontent.com"

var sigstoreVerifier *verify.Verifier
var sigstoreVerifierErr error
var sigstoreVerifierOnce sync.Once

// SigstoreVerifier fetches the Sigstore trusted root via TUF (cached under
// $HOME/.sigstore) and builds a verifier requiring SCT + Rekor inclusion.
func SigstoreVerifier() (*verify.Verifier, error) {
	sigstoreVerifierOnce.Do(func() {
		trustedMaterial, err := root.FetchTrustedRoot()
		if err != nil {
			sigstoreVerifierErr = fmt.Errorf("failed to fetch sigstore trusted root: %v", err)
			return
		}
		sigstoreVerifier, sigstoreVerifierErr = verify.NewSignedEntityVerifier(trustedMaterial,
			verify.WithSignedCertificateTimestamps(1),
			verify.WithTransparencyLog(1),
			verify.WithObserverTimestamps(1))
	})
	return sigstoreVerifier, sigstoreVerifierErr
}

// FetchGithubAttestations returns the Sigstore bundles attached to a digest
// ("sha256:...") in repo's attestation store.
func FetchGithubAttestations(repo, digest string) ([]json.RawMessage, error) {
	url := "https://api.github.com/repos/" + repo + "/attestations/" + digest

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

	data, err := io.ReadAll(resp.Body)
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

// VerifyGithubAttestation verifies that at least one of repo's attestation
// bundles for digest covers it and was signed by a workflow identity
// matching sanRegex.
func VerifyGithubAttestation(repo, digest, sanRegex string) error {
	digestHex := strings.TrimPrefix(digest, "sha256:")
	digestBytes, err := hex.DecodeString(digestHex)
	if err != nil || len(digestBytes) != 32 {
		return fmt.Errorf("invalid digest %s", digest)
	}

	bundles, err := FetchGithubAttestations(repo, "sha256:"+digestHex)
	if err != nil {
		return err
	}

	verifier, err := SigstoreVerifier()
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
