package common

// Which images must carry a build provenance attestation, and from which
// workflow: SPR's own images and the spr-networks plugin images.

import (
	"regexp"
	"strings"
)

var AttestationSANRegex = `^https://github\.com/spr-networks/super/\.github/workflows/docker-image\.yml@`
var AttestationImagePrefix = "ghcr.io/spr-networks/super_"

var PfwAttestationSANRegex = `^https://github\.com/spr-networks/pfw_extension/\.github/workflows/docker-image\.yml@`
var MeshAttestationSANRegex = `^https://github\.com/spr-networks/mesh_extension/\.github/workflows/docker-image\.yml@`

type AttestPolicy struct {
	SANRegex string
	//registry attestations (cosign .att artifact) vs the github attestations api
	Registry bool
}

var AttestPolicies = map[string]AttestPolicy{
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

func PluginAttestPolicy(image string) *AttestPolicy {
	if idx := strings.IndexByte(image, '@'); idx != -1 {
		image = image[:idx]
	}

	host, repo, _ := SplitImageRef(image)
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

	return &AttestPolicy{SANRegex: sanRegex, Registry: true}
}

func AttestationPolicyForImage(image string) *AttestPolicy {
	for prefix, policy := range AttestPolicies {
		if strings.HasPrefix(image, prefix) {
			p := policy
			return &p
		}
	}
	return PluginAttestPolicy(image)
}
