package main

import (
	"context"
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type radioSecurityCapabilities struct {
	CCMP256 bool
	SAE     bool
}

// Query the requested interface's PHY, not `iw list`: another radio may support
// security features that this one cannot use.
var radioSecurityForInterface = queryRadioSecurity

func queryRadioSecurity(iface string) (radioSecurityCapabilities, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return probeRadioSecurity(iface, func(args ...string) ([]byte, error) {
		return exec.CommandContext(ctx, "iw", args...).Output()
	})
}

var securityWiphyPattern = regexp.MustCompile(`(?m)^\s*wiphy ([0-9]+)\s*$`)
var securityCipherPattern = regexp.MustCompile(`^\* .*\(([0-9a-f]{2}-[0-9a-f]{2}-[0-9a-f]{2}:[0-9]+)\)$`)

func probeRadioSecurity(iface string, iw func(...string) ([]byte, error)) (radioSecurityCapabilities, error) {
	if !isValidIface(iface) {
		return radioSecurityCapabilities{}, fmt.Errorf("invalid interface %q", iface)
	}
	dev, err := iw("dev", iface, "info")
	if err != nil {
		return radioSecurityCapabilities{}, fmt.Errorf("read PHY for %s: %w", iface, err)
	}
	match := securityWiphyPattern.FindSubmatch(dev)
	if match == nil {
		return radioSecurityCapabilities{}, fmt.Errorf("iw did not report a PHY for %s", iface)
	}
	phy := "phy" + string(match[1])
	info, err := iw("phy", phy, "info")
	if err != nil {
		return radioSecurityCapabilities{}, fmt.Errorf("read capabilities for %s (%s): %w", iface, phy, err)
	}
	return parseRadioSecurity(string(info), phy)
}

func parseRadioSecurity(info, phy string) (radioSecurityCapabilities, error) {
	var caps radioSecurityCapabilities
	foundPHY, inCiphers, foundCipher := false, false, false
	for _, raw := range strings.Split(info, "\n") {
		line := strings.TrimSpace(raw)
		if strings.HasPrefix(line, "Wiphy ") {
			if line != "Wiphy "+phy || foundPHY {
				return caps, fmt.Errorf("unexpected PHY in iw capabilities for %s", phy)
			}
			foundPHY = true
		}
		if line == "Supported Ciphers:" {
			inCiphers = true
			continue
		}
		if inCiphers && line != "" {
			if match := securityCipherPattern.FindStringSubmatch(line); match != nil {
				foundCipher = true
				if match[1] == "00-0f-ac:10" {
					caps.CCMP256 = true
				}
			} else {
				inCiphers = false
			}
		}
		// SAE_OFFLOAD alone is station mode support, not AP support.
		if line == "Device supports SAE with AUTHENTICATE command" || strings.HasPrefix(line, "* [ SAE_OFFLOAD_AP ]:") {
			caps.SAE = true
		}
	}
	if !foundPHY || !foundCipher {
		return caps, fmt.Errorf("incomplete iw security capabilities for %s", phy)
	}
	return caps, nil
}

func isSAEKeyMgmt(value string) bool {
	return value == "SAE" || value == "FT-SAE" || value == "SAE-EXT-KEY" || value == "FT-SAE-EXT-KEY"
}

func filterSecurityTokens(value string, unsupported func(string) bool) (string, bool, error) {
	kept := []string{}
	changed := false
	for _, token := range strings.Fields(value) {
		if unsupported(token) {
			changed = true
		} else {
			kept = append(kept, token)
		}
	}
	if !changed {
		return value, false, nil
	}
	if len(kept) == 0 {
		return "", true, fmt.Errorf("no supported option remains in %q", value)
	}
	return strings.Join(kept, " "), true, nil
}

// Apply to the complete rendered config, including every guest BSS. Keep the
// remaining configured choices; never turn an SAE-only network into a PSK AP.
func constrainHostapdSecurity(data string, caps radioSecurityCapabilities) (string, error) {
	lines := strings.Split(data, "\n")
	starts := []int{0}
	requireSAE := false
	for i, line := range lines {
		key, value, ok := strings.Cut(strings.TrimSpace(line), "=")
		if !ok {
			continue
		}
		if key == "bss" {
			starts = append(starts, i)
		}
		if key == "op_class" {
			class, _ := strconv.Atoi(value)
			requireSAE = requireSAE || (class >= 131 && class <= 137)
		}
		if key == "mld_ap" && value == "1" {
			requireSAE = true
		}
	}
	starts = append(starts, len(lines))
	for s := 0; s < len(starts)-1; s++ {
		removedSAE := false
		for i := starts[s]; i < starts[s+1]; i++ {
			key, value, ok := strings.Cut(strings.TrimSpace(lines[i]), "=")
			if !ok {
				continue
			}
			var unsupported func(string) bool
			switch key {
			case "rsn_pairwise", "wpa_pairwise", "group_cipher":
				unsupported = func(token string) bool { return token == "CCMP-256" && !caps.CCMP256 }
			case "wpa_key_mgmt":
				unsupported = func(token string) bool { return isSAEKeyMgmt(token) && !caps.SAE }
			default:
				continue
			}
			filtered, changed, err := filterSecurityTokens(value, unsupported)
			if err != nil {
				return "", fmt.Errorf("%s: %w", key, err)
			}
			if changed {
				if key == "wpa_key_mgmt" {
					if requireSAE {
						return "", fmt.Errorf("SAE is unavailable on this radio; cannot fall back to WPA2 for 6 GHz or MLO")
					}
					removedSAE = true
				}
				lines[i] = key + "=" + filtered
			}
		}
		if removedSAE {
			for i := starts[s]; i < starts[s+1]; i++ {
				if strings.HasPrefix(strings.TrimSpace(lines[i]), "sae_") {
					lines[i] = ""
				}
			}
		}
	}
	return strings.Join(lines, "\n"), nil
}

func prepareHostapdSecurity(iface, data string) (string, error) {
	caps, err := radioSecurityForInterface(iface)
	if err != nil {
		return "", err
	}
	checked, err := constrainHostapdSecurity(data, caps)
	if err != nil {
		return "", fmt.Errorf("security configuration for %s: %w", iface, err)
	}
	return checked, nil
}
