package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

func getRustapConfigPath() string {
	return TEST_PREFIX + "/configs/wifi/rustap.json"
}

func readRustapConfig(iface string) (conf map[string]interface{}, ok bool, err error) {
	data, err := os.ReadFile(getRustapConfigPath())
	if errors.Is(err, os.ErrNotExist) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}

	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.UseNumber()
	if err := decoder.Decode(&conf); err != nil {
		return nil, false, fmt.Errorf("invalid rustap.json: %w", err)
	}
	if err := requireRustapJSONEOF(decoder); err != nil {
		return nil, false, fmt.Errorf("invalid rustap.json: %w", err)
	}
	configured, ok := conf["iface"].(string)
	if !ok || configured != iface {
		return nil, false, nil
	}
	return conf, true, nil
}

func requireRustapJSONEOF(decoder *json.Decoder) error {
	var trailing interface{}
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			return fmt.Errorf("multiple JSON values are not allowed")
		}
		return fmt.Errorf("trailing data: %w", err)
	}
	return nil
}

func decodeRustapPatch(r *http.Request) (map[string]interface{}, error) {
	decoder := json.NewDecoder(r.Body)
	decoder.UseNumber()
	patch := map[string]interface{}{}
	if err := decoder.Decode(&patch); err != nil {
		return nil, err
	}
	if patch == nil {
		return nil, fmt.Errorf("config patch must be a JSON object")
	}
	if err := requireRustapJSONEOF(decoder); err != nil {
		return nil, err
	}
	return patch, nil
}

func rustapConfigCredentialField(key string) bool {
	switch key {
	case "passphrase", "wpa_passphrase", "sae_password", "psk":
		return true
	default:
		return false
	}
}

func cloneRustapValue(value interface{}, redact bool) interface{} {
	switch typed := value.(type) {
	case map[string]interface{}:
		copy := make(map[string]interface{}, len(typed))
		for key, child := range typed {
			if redact && rustapConfigCredentialField(key) {
				continue
			}
			copy[key] = cloneRustapValue(child, redact)
		}
		return copy
	case []interface{}:
		copy := make([]interface{}, len(typed))
		for i, child := range typed {
			copy[i] = cloneRustapValue(child, redact)
		}
		return copy
	default:
		return typed
	}
}

// rustapConfigForAPI returns an independent copy so response decoration and
// recursive credential redaction can never mutate the on-disk configuration.
func rustapConfigForAPI(rustap map[string]interface{}) map[string]interface{} {
	view := cloneRustapValue(rustap, true).(map[string]interface{})
	view["backend"] = "rustap"
	return view
}

func rustapString(conf map[string]interface{}, key, fallback string) string {
	if value, ok := conf[key].(string); ok {
		return value
	}
	return fallback
}

func rustapBool(conf map[string]interface{}, key string, fallback bool) bool {
	if value, ok := conf[key].(bool); ok {
		return value
	}
	return fallback
}

func rustapNumber(value interface{}) (float64, error) {
	switch typed := value.(type) {
	case json.Number:
		number, err := typed.Float64()
		if err != nil {
			return 0, err
		}
		return number, nil
	case float64:
		return typed, nil
	case float32:
		return float64(typed), nil
	case int:
		return float64(typed), nil
	case int64:
		return float64(typed), nil
	case uint64:
		return float64(typed), nil
	default:
		return 0, fmt.Errorf("must be a number")
	}
}

func rustapInt(conf map[string]interface{}, key string, fallback int) (int, error) {
	value, exists := conf[key]
	if !exists {
		return fallback, nil
	}
	if number, ok := value.(json.Number); ok {
		integer, err := strconv.ParseInt(number.String(), 10, 64)
		if err != nil {
			return 0, fmt.Errorf("%s must be an integer", key)
		}
		if strconv.IntSize == 32 && (integer < math.MinInt32 || integer > math.MaxInt32) {
			return 0, fmt.Errorf("%s is outside the supported integer range", key)
		}
		return int(integer), nil
	}
	number, err := rustapNumber(value)
	if err != nil || math.IsNaN(number) || math.IsInf(number, 0) || math.Trunc(number) != number {
		return 0, fmt.Errorf("%s must be an integer", key)
	}
	if number < -math.Pow(2, float64(strconv.IntSize-1)) || number >= math.Pow(2, float64(strconv.IntSize-1)) {
		return 0, fmt.Errorf("%s is outside the supported integer range", key)
	}
	return int(number), nil
}

func rustapBand(conf map[string]interface{}, key string, fallback float64) (float64, error) {
	value, exists := conf[key]
	if !exists {
		return fallback, nil
	}
	number, err := rustapNumber(value)
	if err != nil || math.IsNaN(number) || math.IsInf(number, 0) {
		return 0, fmt.Errorf("%s must be 2.4, 5, or 6", key)
	}
	return number, nil
}

func validRustapBand(band float64) bool {
	return band == 2.4 || band == 5 || band == 6
}

func validRustapWidth(width int) bool {
	return width == 20 || width == 40 || width == 80 || width == 160 || width == 320
}

func validRustapPhy(phy string) bool {
	switch strings.ToLower(phy) {
	case "n", "ht", "ac", "vht", "ax", "he", "be", "eht":
		return true
	default:
		return false
	}
}

func validateRustapRadio(channel, width int, band float64, label string) error {
	if channel < 1 || channel > 253 {
		return fmt.Errorf("%s channel must be between 1 and 253", label)
	}
	if !validRustapBand(band) {
		return fmt.Errorf("%s band must be 2.4, 5, or 6", label)
	}
	if !validRustapWidth(width) {
		return fmt.Errorf("%s width must be 20, 40, 80, 160, or 320 MHz", label)
	}
	if width == 320 && band != 6 {
		return fmt.Errorf("%s 320 MHz width requires the 6 GHz band", label)
	}
	if width >= 80 && band == 2.4 {
		return fmt.Errorf("%s 80/160 MHz width requires a 5 or 6 GHz channel", label)
	}
	if band == 2.4 && channel > 14 {
		return fmt.Errorf("%s channel %d is not in the 2.4 GHz band", label, channel)
	}
	if band == 5 && channel <= 14 {
		return fmt.Errorf("%s channel %d is not in the 5 GHz band", label, channel)
	}
	if band == 6 && (channel > 233 || channel%4 != 1) {
		return fmt.Errorf("%s channel %d is not a 6 GHz primary channel", label, channel)
	}
	return nil
}

func writeRustapConfig(conf map[string]interface{}) error {
	data, err := json.MarshalIndent(conf, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')

	path := getRustapConfigPath()
	tmp, err := os.CreateTemp(filepath.Dir(path), ".rustap.json.*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		return err
	}
	if dir, err := os.Open(filepath.Dir(path)); err == nil {
		defer dir.Close()
		_ = dir.Sync()
	}
	return nil
}

func rustapHardwareMAC(iface string) (string, error) {
	dev, err := net.InterfaceByName(iface)
	if err != nil {
		return "", err
	}
	if len(dev.HardwareAddr) != 6 {
		return "", fmt.Errorf("%s has invalid hardware address", iface)
	}
	return dev.HardwareAddr.String(), nil
}

func validRustapHardwareMAC(value string) bool {
	mac, err := net.ParseMAC(value)
	return err == nil && len(mac) == 6 && mac[0]&1 == 0
}

func rustapMLDHardwareMAC(conf map[string]interface{}, iface, override string) (string, error) {
	if override != "" {
		if !validRustapHardwareMAC(override) {
			return "", fmt.Errorf("invalid MLD hardware address %q", override)
		}
		return override, nil
	}
	if live, err := rustapHardwareMAC(iface); err == nil && validRustapHardwareMAC(live) {
		return live, nil
	}
	if configured := rustapString(conf, "mac", ""); validRustapHardwareMAC(configured) {
		return configured, nil
	}
	return "", fmt.Errorf("could not determine a valid hardware address for %s", iface)
}

// Derive deterministic, locally administered affiliated-link addresses from
// the physical interface MAC. No machine-specific address is hardcoded.
func rustapLinkMAC(hardware string, linkID int) (string, error) {
	mac, err := net.ParseMAC(hardware)
	if err != nil || len(mac) != 6 {
		return "", fmt.Errorf("invalid MLD hardware address %q", hardware)
	}
	link := append(net.HardwareAddr(nil), mac...)
	link[0] = (link[0] | 0x02) & 0xfe
	link[5] ^= byte(0x10 + linkID)
	return link.String(), nil
}

// applyRustapPatch applies a native-schema patch to a private copy. System
// fields, secrets, helper paths, and credential-file paths cannot be changed
// through this endpoint.
func applyRustapPatch(existing, patch map[string]interface{}, iface, hardwareMAC string) (map[string]interface{}, error) {
	conf := cloneRustapValue(existing, false).(map[string]interface{})
	for key := range patch {
		switch key {
		case "ssid", "country", "channel", "width", "phy", "band", "wmm", "per_sta_vif", "mld", "mld_links":
		default:
			return nil, fmt.Errorf("RustAP config field %q is not modifiable", key)
		}
	}

	if value, ok := patch["ssid"]; ok {
		ssid, ok := value.(string)
		if !ok || len(ssid) == 0 || len([]byte(ssid)) > 32 {
			return nil, fmt.Errorf("ssid must be a non-empty string of at most 32 bytes")
		}
		conf["ssid"] = ssid
	}
	if value, ok := patch["country"]; ok {
		country, ok := value.(string)
		if !ok {
			return nil, fmt.Errorf("country must be a two-letter code")
		}
		country = strings.ToUpper(country)
		if len(country) != 2 || country[0] < 'A' || country[0] > 'Z' || country[1] < 'A' || country[1] > 'Z' {
			return nil, fmt.Errorf("country must be a two-letter code")
		}
		conf["country"] = country
	}
	if _, ok := patch["channel"]; ok {
		channel, err := rustapInt(patch, "channel", 0)
		if err != nil {
			return nil, err
		}
		conf["channel"] = channel
	}
	if _, ok := patch["width"]; ok {
		width, err := rustapInt(patch, "width", 0)
		if err != nil {
			return nil, err
		}
		conf["width"] = width
	}
	if value, ok := patch["phy"]; ok {
		phy, ok := value.(string)
		if !ok || !validRustapPhy(phy) {
			return nil, fmt.Errorf("phy must be one of n/ht/ac/vht/ax/he/be/eht")
		}
		conf["phy"] = strings.ToLower(phy)
	}
	if _, ok := patch["band"]; ok {
		band, err := rustapBand(patch, "band", 0)
		if err != nil || !validRustapBand(band) {
			return nil, fmt.Errorf("band must be 2.4, 5, or 6")
		}
		conf["band"] = band
	}
	for _, key := range []string{"wmm", "per_sta_vif"} {
		if value, ok := patch[key]; ok {
			boolean, ok := value.(bool)
			if !ok {
				return nil, fmt.Errorf("%s must be a boolean", key)
			}
			conf[key] = boolean
		}
	}

	channel, err := rustapInt(conf, "channel", 0)
	if err != nil {
		return nil, err
	}
	width, err := rustapInt(conf, "width", 0)
	if err != nil {
		return nil, err
	}
	defaultBand := 5.0
	if channel <= 14 {
		defaultBand = 2.4
	}
	if rustapBool(conf, "band6", false) {
		defaultBand = 6
	}
	band, err := rustapBand(conf, "band", defaultBand)
	if err != nil {
		return nil, err
	}
	conf["band"] = band
	delete(conf, "band6")
	if err := validateRustapRadio(channel, width, band, "primary"); err != nil {
		return nil, err
	}

	phy := strings.ToLower(rustapString(conf, "phy", ""))
	if band == 6 && phy != "ax" && phy != "he" && phy != "be" && phy != "eht" {
		return nil, fmt.Errorf("6 GHz requires HE/ax or EHT/be phy")
	}
	if band == 6 && strings.Contains(strings.ToLower(rustapString(conf, "key_mgmt", "")), "psk") {
		return nil, fmt.Errorf("6 GHz requires SAE or OWE security")
	}

	mld := rustapBool(conf, "mld", false)
	if value, ok := patch["mld"]; ok {
		var valid bool
		mld, valid = value.(bool)
		if !valid {
			return nil, fmt.Errorf("mld must be a boolean")
		}
	}
	if !mld {
		if _, supplied := patch["mld_links"]; supplied {
			return nil, fmt.Errorf("mld_links requires mld to be enabled")
		}
		delete(conf, "mld")
		delete(conf, "link_id")
		delete(conf, "mld_links")
		return conf, nil
	}
	if phy != "be" && phy != "eht" {
		return nil, fmt.Errorf("MLO requires Wi-Fi 7 / EHT phy")
	}

	linksRaw, supplied := patch["mld_links"]
	if !supplied {
		linksRaw = conf["mld_links"]
	}
	links, ok := linksRaw.([]interface{})
	if !ok || len(links) < 2 {
		return nil, fmt.Errorf("mld_links must contain at least two native RustAP links")
	}
	hardwareMAC, err = rustapMLDHardwareMAC(conf, iface, hardwareMAC)
	if err != nil {
		return nil, err
	}
	associationLinkID, err := rustapInt(conf, "link_id", 0)
	if err != nil || associationLinkID < 0 || associationLinkID > 15 {
		return nil, fmt.Errorf("association link_id must be between 0 and 15")
	}

	seen := map[int]bool{}
	normalized := make([]interface{}, 0, len(links))
	for _, raw := range links {
		link, ok := raw.(map[string]interface{})
		if !ok {
			return nil, fmt.Errorf("each mld_links entry must be an object")
		}
		linkID, err := rustapInt(link, "link_id", -1)
		if err != nil {
			return nil, fmt.Errorf("mld link_id: %w", err)
		}
		if linkID < 0 || linkID > 15 || seen[linkID] {
			return nil, fmt.Errorf("mld link_id must be unique and between 0 and 15")
		}
		seen[linkID] = true
		linkChannel, err := rustapInt(link, "channel", 0)
		if err != nil {
			return nil, fmt.Errorf("MLD link %d: %w", linkID, err)
		}
		linkWidth, err := rustapInt(link, "width", width)
		if err != nil {
			return nil, fmt.Errorf("MLD link %d: %w", linkID, err)
		}
		linkDefaultBand := band
		if linkChannel <= 14 {
			linkDefaultBand = 2.4
		} else if rustapBool(link, "band6", false) {
			linkDefaultBand = 6
		}
		linkBand, err := rustapBand(link, "band", linkDefaultBand)
		if err != nil {
			return nil, fmt.Errorf("MLD link %d: %w", linkID, err)
		}
		if linkID == associationLinkID {
			linkChannel, linkWidth, linkBand = channel, width, band
		}
		if err := validateRustapRadio(linkChannel, linkWidth, linkBand, fmt.Sprintf("MLD link %d", linkID)); err != nil {
			return nil, err
		}
		linkMAC, err := rustapLinkMAC(hardwareMAC, linkID)
		if err != nil {
			return nil, err
		}
		normalized = append(normalized, map[string]interface{}{
			"link_id": linkID,
			"mac":     linkMAC,
			"channel": linkChannel,
			"width":   linkWidth,
			"band":    linkBand,
		})
	}
	if !seen[associationLinkID] {
		return nil, fmt.Errorf(
			"mld_links must include association link_id %d",
			associationLinkID,
		)
	}

	conf["mac"] = hardwareMAC
	conf["mld"] = true
	conf["link_id"] = associationLinkID
	conf["mld_links"] = normalized
	return conf, nil
}

func rustapConfigForInterface(iface string) (map[string]interface{}, bool, error) {
	conf, ok, err := readRustapConfig(iface)
	if err != nil || !ok {
		return nil, ok, err
	}
	view := rustapConfigForAPI(conf)
	status, statusErr := RunHostapdStatus(iface)
	view["running"] = statusErr == nil && status["backend"] == "rustap"
	return view, true, nil
}

func rustapUpdateConfigIfOwned(w http.ResponseWriter, r *http.Request, iface string) bool {
	conf, ok, err := readRustapConfig(iface)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return true
	}
	if !ok {
		return false
	}
	patch, err := decodeRustapPatch(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return true
	}
	updated, err := applyRustapPatch(conf, patch, iface, "")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return true
	}
	if err := writeRustapConfig(updated); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return true
	}
	callSuperdRestart("", "wifid")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rustapConfigForAPI(updated))
	return true
}

func rustapChannelSwitchIfOwned(w http.ResponseWriter, iface string, params ChannelParameters, calculated CalculatedChannelParameters) bool {
	conf, ok, err := readRustapConfig(iface)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return true
	}
	if !ok {
		return false
	}

	phy := "vht"
	if params.EHT_Enable {
		phy = "be"
	} else if params.HE_Enable {
		phy = "he"
	} else if params.Mode != "a" {
		phy = "ht"
	}
	band := 2.4
	if calculated.Is_6e {
		band = 6
	} else if params.Mode == "a" {
		band = 5
	}
	patch := map[string]interface{}{
		"channel": params.Channel,
		"width":   params.Bandwidth,
		"phy":     phy,
		"band":    band,
	}
	updated, err := applyRustapPatch(conf, patch, iface, "")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return true
	}
	if err := writeRustapConfig(updated); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return true
	}
	callSuperdRestart("", "wifid")
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(calculated)
	return true
}
