package main

// Pure, table-driven tests for the SPR-networks custom-plugin attestation
// policy derivation. No network or docker access: these only exercise
// attestationPolicyForImage / pluginAttestPolicy and the derived SAN regex.

import (
	"regexp"
	"testing"
)

// sanFor builds the workflow-identity URL a docker-image.yml provenance
// certificate would carry for the given spr-networks repo.
func sanFor(repo, ref string) string {
	return "https://github.com/spr-networks/" + repo + "/.github/workflows/docker-image.yml@" + ref
}

func TestPluginPolicySprTor(t *testing.T) {
	p := attestationPolicyForImage("ghcr.io/spr-networks/spr-tor:latest")
	if p == nil {
		t.Fatal("expected a policy for spr-tor")
	}
	if !p.registry {
		t.Error("plugin policy must use the registry path")
	}

	re, err := regexp.Compile(p.sanRegex)
	if err != nil {
		t.Fatalf("derived sanRegex does not compile: %v", err)
	}

	// matches its own repo's provenance identity
	own := sanFor("spr-tor", "refs/tags/v1.2.3")
	if !re.MatchString(own) {
		t.Errorf("sanRegex %q did not match own identity %q", p.sanRegex, own)
	}

	// least privilege: must NOT match a sibling plugin's identity
	foreign := sanFor("spr-nebula", "refs/tags/v1.2.3")
	if re.MatchString(foreign) {
		t.Errorf("sanRegex %q matched foreign identity %q", p.sanRegex, foreign)
	}
}

func TestPluginPolicyPlusMirror(t *testing.T) {
	p := attestationPolicyForImage("containers.plus.supernetworks.org/spr-networks/spr-headscale")
	if p == nil {
		t.Fatal("expected a policy for the plus-mirror spr-headscale")
	}
	if !p.registry {
		t.Error("plugin policy must use the registry path")
	}

	re, err := regexp.Compile(p.sanRegex)
	if err != nil {
		t.Fatalf("derived sanRegex does not compile: %v", err)
	}
	if !re.MatchString(sanFor("spr-headscale", "refs/heads/main")) {
		t.Errorf("sanRegex %q did not match spr-headscale identity", p.sanRegex)
	}
	if re.MatchString(sanFor("spr-tor", "refs/heads/main")) {
		t.Errorf("sanRegex %q leaked to a foreign repo", p.sanRegex)
	}
}

func TestPluginPolicyDigestAndTagSameRepo(t *testing.T) {
	tagged := attestationPolicyForImage("ghcr.io/spr-networks/spr-simplex:v2")
	digested := attestationPolicyForImage(
		"ghcr.io/spr-networks/spr-simplex@sha256:" +
			"0000000000000000000000000000000000000000000000000000000000000000")
	if tagged == nil || digested == nil {
		t.Fatal("expected policies for both tag- and digest-pinned refs")
	}
	if tagged.sanRegex != digested.sanRegex {
		t.Errorf("tag/digest refs derived different SANs: %q vs %q",
			tagged.sanRegex, digested.sanRegex)
	}
}

// The existing static-map prefixes must keep their exact original policies.
func TestExistingPoliciesUnchanged(t *testing.T) {
	cases := []struct {
		image    string
		sanRegex string
	}{
		{"ghcr.io/spr-networks/super_api:latest", AttestationSANRegex},
		{"ghcr.io/spr-networks/pfw_extension_pfw:latest", PfwAttestationSANRegex},
		{"ghcr.io/spr-networks/mesh_extension_mesh:latest", MeshAttestationSANRegex},
		{"containers.plus.supernetworks.org/spr-networks/pfw_extension_pfw", PfwAttestationSANRegex},
		{"containers.plus.supernetworks.org/spr-networks/mesh_extension_mesh", MeshAttestationSANRegex},
	}
	for _, c := range cases {
		p := attestationPolicyForImage(c.image)
		if p == nil {
			t.Errorf("%s: expected a policy", c.image)
			continue
		}
		if p.sanRegex != c.sanRegex {
			t.Errorf("%s: sanRegex = %q, want %q", c.image, p.sanRegex, c.sanRegex)
		}
		if !p.registry {
			t.Errorf("%s: registry = false, want true", c.image)
		}
	}
}

// Adversarial refs must not yield a policy (or must not yield one whose regex
// matches a foreign repo).
func TestPluginPolicyAdversarial(t *testing.T) {
	nilCases := []string{
		"ghcr.io/spr-networks/spr-",          // empty plugin name
		"ghcr.io/evil/spr-tor",               // wrong org
		"ghcr.io/spr-networks/notaplugin",    // missing spr- prefix
		"ghcr.io/spr-networks/super_api",     // handled by static map, not here... but pluginAttestPolicy alone should reject non spr- name
		"ghcr.io/spr-networks/spr-tor/extra", // extra path segment -> org mismatch
		"docker.io/spr-networks/spr-tor",     // untrusted host
		"ghcr.io/spr-networks",               // no repo name
	}
	for _, image := range nilCases {
		if p := pluginAttestPolicy(image); p != nil {
			t.Errorf("pluginAttestPolicy(%q) = %+v, want nil", image, p)
		}
	}

	// a name carrying regex metacharacters must be rejected outright (so it can
	// never be compiled into a pattern that matches a foreign repo)
	meta := "ghcr.io/spr-networks/spr-a.*b"
	p := pluginAttestPolicy(meta)
	if p == nil {
		// rejected outright - the safe outcome
		return
	}
	// if for some reason a policy was produced, its regex must be escaped and
	// therefore must NOT match an arbitrary foreign identity
	re, err := regexp.Compile(p.sanRegex)
	if err != nil {
		t.Fatalf("derived sanRegex does not compile: %v", err)
	}
	if re.MatchString(sanFor("spr-anythingb", "refs/heads/main")) {
		t.Errorf("metachar name produced a wildcard-matching regex: %q", p.sanRegex)
	}
}
