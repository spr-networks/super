package main

// Tests for build provenance verification. These verify against the real
// attestation of a published image (created by docker-image.yml via
// actions/attest-build-provenance), so they need network access to
// api.github.com, ghcr.io, and the Sigstore TUF repository; they skip when
// unreachable.

import (
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// a digest attested by the Docker Image CI workflow (super_api)
const attestedDigest = "sha256:917cbd6f1420cc92cf6d65848d17e15e428d6fda825017a4a8fadff86d6c7e6f"

func requireNetwork(t *testing.T) {
	t.Helper()
	c := http.Client{Timeout: 10 * time.Second}
	resp, err := c.Get("https://api.github.com/")
	if err != nil {
		t.Skipf("github api unreachable: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode == http.StatusForbidden {
		t.Skip("github api rate limited")
	}
}

func TestVerifyKnownAttestation(t *testing.T) {
	requireNetwork(t)

	if err := verifyAttestationForDigest(attestedDigest); err != nil {
		t.Errorf("verifyAttestationForDigest(%s) error = %v", attestedDigest, err)
	}
}

func TestVerifyUnknownDigest(t *testing.T) {
	requireNetwork(t)

	// same length, flipped tail - no attestation can exist for it
	bad := attestedDigest[:len(attestedDigest)-4] + "0000"
	if err := verifyAttestationForDigest(bad); err == nil {
		t.Error("verification succeeded for a digest with no attestation")
	}
}

func TestVerifyInvalidDigest(t *testing.T) {
	if err := verifyAttestationForDigest("sha256:nothex"); err == nil {
		t.Error("verification succeeded for a malformed digest")
	}
}

// the certificate identity policy must reject attestations from other workflows
func TestVerifyWrongIdentityRejected(t *testing.T) {
	requireNetwork(t)

	oldRegex := AttestationSANRegex
	AttestationSANRegex = `^https://github\.com/some-other-org/other-repo/`
	defer func() { AttestationSANRegex = oldRegex }()

	if err := verifyAttestationForDigest(attestedDigest); err == nil {
		t.Error("verification succeeded with a mismatched workflow identity")
	}
}

func TestResolveRemoteDigestAny(t *testing.T) {
	requireNetwork(t)

	digest, err := resolveRemoteDigestAny("ghcr.io/spr-networks/super_api:latest")
	if err != nil {
		t.Fatalf("resolveRemoteDigestAny() error = %v", err)
	}
	if !strings.HasPrefix(digest, "sha256:") || len(digest) != len("sha256:")+64 {
		t.Errorf("unexpected digest format: %s", digest)
	}

	if _, err := resolveRemoteDigestAny("no-such-registry.invalid/foo/bar:latest"); err == nil {
		t.Error("resolveRemoteDigestAny accepted an unreachable registry")
	}
}

// digests attested by the extension CI (attestations are digest-addressed,
// so these remain fetchable after the latest tag moves on)
const pfwAttestedDigest = "sha256:b43835cab905fbacc7b4666f09460d9cc418442960c5aacb3b53fffec6ad95c5"
const meshAttestedDigest = "sha256:69dd652739bd0ba4ff406d4467995e5de8b748efa553b9285093b4cac9d4c9b1"
const plusRegistry = "containers.plus.supernetworks.org"

// requirePlusCreds wires PLUS_AUTH (base64 user:token) into a docker config,
// the same credentials a subscribed device holds
func requirePlusCreds(t *testing.T) {
	t.Helper()
	auth := os.Getenv("PLUS_AUTH")
	if auth == "" {
		t.Skip("PLUS_AUTH not set")
	}

	dir := t.TempDir()
	config := `{"auths": {"` + plusRegistry + `": {"auth": "` + auth + `"}}}`
	if err := os.WriteFile(dir+"/config.json", []byte(config), 0600); err != nil {
		t.Fatal(err)
	}

	old := DockerConfigPath
	DockerConfigPath = dir + "/config.json"
	t.Cleanup(func() { DockerConfigPath = old })
}

func TestVerifyRegistryAttestationPfw(t *testing.T) {
	requireNetwork(t)
	requirePlusCreds(t)

	err := verifyRegistryAttestation(plusRegistry, "spr-networks/pfw_extension_pfw",
		pfwAttestedDigest, PfwAttestationSANRegex)
	if err != nil {
		t.Errorf("verifyRegistryAttestation(pfw) error = %v", err)
	}
}

func TestVerifyRegistryAttestationMesh(t *testing.T) {
	requireNetwork(t)
	requirePlusCreds(t)

	err := verifyRegistryAttestation(plusRegistry, "spr-networks/mesh_extension_mesh",
		meshAttestedDigest, MeshAttestationSANRegex)
	if err != nil {
		t.Errorf("verifyRegistryAttestation(mesh) error = %v", err)
	}
}

func TestVerifyRegistryAttestationWrongIdentity(t *testing.T) {
	requireNetwork(t)
	requirePlusCreds(t)

	err := verifyRegistryAttestation(plusRegistry, "spr-networks/pfw_extension_pfw",
		pfwAttestedDigest, MeshAttestationSANRegex)
	if err == nil {
		t.Error("pfw attestation verified against the mesh workflow identity")
	}
}

func TestVerifyRegistryAttestationMissing(t *testing.T) {
	requireNetwork(t)
	requirePlusCreds(t)

	bad := pfwAttestedDigest[:len(pfwAttestedDigest)-4] + "0000"
	err := verifyRegistryAttestation(plusRegistry, "spr-networks/pfw_extension_pfw",
		bad, PfwAttestationSANRegex)
	if err == nil {
		t.Error("verification succeeded for a digest with no attestation")
	}
}
