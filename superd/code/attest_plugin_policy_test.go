package main

import (
	"regexp"
	"testing"
)

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

	own := sanFor("spr-tor", "refs/tags/v1.2.3")
	if !re.MatchString(own) {
		t.Errorf("sanRegex %q did not match own identity %q", p.sanRegex, own)
	}

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

func TestPluginPolicyAdversarial(t *testing.T) {
	nilCases := []string{
		"ghcr.io/spr-networks/spr-",
		"ghcr.io/evil/spr-tor",
		"ghcr.io/spr-networks/notaplugin",
		"ghcr.io/spr-networks/super_api",
		"ghcr.io/spr-networks/spr-tor/extra",
		"docker.io/spr-networks/spr-tor",
		"ghcr.io/spr-networks",
	}
	for _, image := range nilCases {
		if p := pluginAttestPolicy(image); p != nil {
			t.Errorf("pluginAttestPolicy(%q) = %+v, want nil", image, p)
		}
	}

	meta := "ghcr.io/spr-networks/spr-a.*b"
	p := pluginAttestPolicy(meta)
	if p == nil {
		return
	}
	re, err := regexp.Compile(p.sanRegex)
	if err != nil {
		t.Fatalf("derived sanRegex does not compile: %v", err)
	}
	if re.MatchString(sanFor("spr-anythingb", "refs/heads/main")) {
		t.Errorf("metachar name produced a wildcard-matching regex: %q", p.sanRegex)
	}
}
