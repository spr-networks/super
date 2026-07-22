package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"syscall"

	yaml "go.yaml.in/yaml/v3"
)

const (
	krunPolicyAnnotation = "run.oci.spr.krun.policy"
	krunPolicyRoot       = "/var/lib/spr-krun"
	krunPolicyDir        = krunPolicyRoot + "/policies"
	krunOverrideDir      = krunPolicyRoot + "/overrides"
	krunManagerKeyPath   = krunPolicyRoot + "/manager.key"
)

var krunSocketNameRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]*[.]sock$`)

type krunComposeService struct {
	Runtime     string            `json:"runtime"`
	Annotations map[string]string `json:"annotations"`
}

type krunComposeConfig struct {
	Services map[string]krunComposeService `json:"services"`
}

type krunTrustedPolicy struct {
	PluginID         string `json:"plugin_id"`
	Service          string `json:"service"`
	CPUs             int    `json:"cpus,omitempty"`
	RAMMiB           int    `json:"ram_mib,omitempty"`
	GPUFlags         int    `json:"gpu_flags,omitempty"`
	NestedVirt       int    `json:"nested_virt,omitempty"`
	UsePasst         int    `json:"use_passt,omitempty"`
	TapName          string `json:"tap_name,omitempty"`
	NetMAC           string `json:"net_mac,omitempty"`
	VsockPath        string `json:"vsock_path,omitempty"`
	VsockPort        int    `json:"vsock_port,omitempty"`
	VsockConnectPath string `json:"vsock_connect_path,omitempty"`
	VsockConnectPort int    `json:"vsock_connect_port,omitempty"`
}

type krunComposeOverride struct {
	Services map[string]struct {
		Annotations map[string]string `yaml:"annotations"`
	} `yaml:"services"`
}

func krunPluginID(composeFile string) (string, bool) {
	cleanPath := filepath.ToSlash(filepath.Clean(composeFile))
	parts := strings.Split(cleanPath, "/")
	if len(parts) != 4 || parts[0] != "plugins" || parts[1] != "user" ||
		parts[3] != "docker-compose-kvm.yml" ||
		!regexp.MustCompile(`^[A-Za-z0-9-]+$`).MatchString(parts[2]) {
		return "", false
	}
	return parts[2], true
}

func readKrunComposeConfig(composeFile string) (krunComposeConfig, error) {
	var out []byte
	var err error
	if _, lookupErr := exec.LookPath("docker"); lookupErr == nil {
		out, err = exec.Command("docker", "compose", "-f", composeFile, "config", "--format", "json").Output()
	}
	if err != nil || len(out) == 0 {
		out, err = exec.Command("docker-compose", "-f", composeFile, "config", "--format", "json").Output()
	}
	if err != nil {
		return krunComposeConfig{}, fmt.Errorf("resolve KVM plugin compose configuration: %w", err)
	}

	config := krunComposeConfig{}
	if err := json.Unmarshal(out, &config); err != nil {
		return krunComposeConfig{}, fmt.Errorf("parse KVM plugin compose configuration: %w", err)
	}
	return config, nil
}

func ensurePrivateDirectory(path string) error {
	if err := os.MkdirAll(path, 0700); err != nil {
		return err
	}
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("trusted krun path is not a directory: %s", path)
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat.Uid != 0 {
		return fmt.Errorf("trusted krun directory is not root-owned: %s", path)
	}
	if info.Mode().Perm()&0077 != 0 {
		return fmt.Errorf("trusted krun directory is accessible by group or other: %s", path)
	}
	return nil
}

func krunManagerKey() ([]byte, error) {
	if err := ensurePrivateDirectory(krunPolicyRoot); err != nil {
		return nil, err
	}
	key, err := os.ReadFile(krunManagerKeyPath)
	if err == nil {
		info, statErr := os.Lstat(krunManagerKeyPath)
		if statErr != nil {
			return nil, fmt.Errorf("inspect krun manager key: %w", statErr)
		}
		stat, statOK := info.Sys().(*syscall.Stat_t)
		if !info.Mode().IsRegular() || !statOK || stat.Uid != 0 || info.Mode().Perm()&0077 != 0 || len(key) != 32 {
			return nil, fmt.Errorf("invalid krun manager key")
		}
		return key, nil
	}
	if !os.IsNotExist(err) {
		return nil, err
	}

	key = make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	file, err := os.OpenFile(krunManagerKeyPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if os.IsExist(err) {
		return krunManagerKey()
	}
	if err != nil {
		return nil, err
	}
	if _, err := file.Write(key); err != nil {
		file.Close()
		os.Remove(krunManagerKeyPath)
		return nil, err
	}
	if err := file.Close(); err != nil {
		os.Remove(krunManagerKeyPath)
		return nil, err
	}
	return key, nil
}

func krunPolicyToken(key []byte, pluginID, service string) string {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte("spr-krun-policy-v1\x00"))
	mac.Write([]byte(pluginID))
	mac.Write([]byte{0})
	mac.Write([]byte(service))
	return hex.EncodeToString(mac.Sum(nil))
}

func krunPluginPrefix(pluginID string) string {
	sum := sha256.Sum256([]byte("spr-krun-plugin-v1\x00" + pluginID))
	return hex.EncodeToString(sum[:16])
}

func krunPluginMAC(pluginID string) string {
	sum := sha256.Sum256([]byte("spr-krun-mac-v1\x00" + pluginID))
	hardware := net.HardwareAddr{0x02, sum[0], sum[1], sum[2], sum[3], sum[4]}
	return hardware.String()
}

func krunPluginTap(pluginID string) string {
	sum := sha256.Sum256([]byte("spr-krun-tap-v1\x00" + pluginID))
	return "kt" + hex.EncodeToString(sum[:6])
}

func parseKrunPolicyInt(annotations map[string]string, key string) (int, error) {
	raw, ok := annotations[key]
	if !ok {
		return 0, nil
	}
	value, err := strconv.ParseInt(raw, 10, 32)
	if err != nil || value <= 0 {
		return 0, fmt.Errorf("%s must be a positive 32-bit integer", key)
	}
	return int(value), nil
}

func assignedKrunSocketPath(pluginID, requestedPath string, listen bool) (string, error) {
	name := filepath.Base(requestedPath)
	if requestedPath == "" || name == "." || name == string(filepath.Separator) || !krunSocketNameRE.MatchString(name) {
		return "", fmt.Errorf("invalid krun socket name %q", requestedPath)
	}
	direction := "connect"
	if listen {
		direction = "listen"
	}
	path := filepath.Join("/run/spr-krun", direction, krunPluginPrefix(pluginID)+"-"+name)
	// sockaddr_un.sun_path is 108 bytes on Linux, including the trailing NUL.
	if len(path) >= 108 {
		return "", fmt.Errorf("assigned krun socket path is too long")
	}
	return path, nil
}

func buildKrunTrustedPolicy(pluginID, service string, annotations map[string]string) (krunTrustedPolicy, error) {
	policy := krunTrustedPolicy{PluginID: pluginID, Service: service}
	var err error
	if policy.CPUs, err = parseKrunPolicyInt(annotations, "krun.cpus"); err != nil {
		return policy, err
	}
	if policy.RAMMiB, err = parseKrunPolicyInt(annotations, "krun.ram_mib"); err != nil {
		return policy, err
	}
	if policy.GPUFlags, err = parseKrunPolicyInt(annotations, "krun.gpu_flags"); err != nil {
		return policy, err
	}
	if policy.NestedVirt, err = parseKrunPolicyInt(annotations, "krun.nested_virt"); err != nil {
		return policy, err
	}

	_, hasTap := annotations["krun.tap_name"]
	_, hasMAC := annotations["krun.net_mac"]
	_, hasUplink := annotations["krun.net_uplink"]
	if hasTap || hasMAC || hasUplink {
		if !hasTap || !hasMAC || !hasUplink {
			return policy, fmt.Errorf("krun TAP networking request must include tap_name, net_mac, and net_uplink")
		}
		policy.TapName = krunPluginTap(pluginID)
		policy.NetMAC = krunPluginMAC(pluginID)
	}
	if requested, ok := annotations["krun.use_passt"]; ok {
		if hasTap {
			return policy, fmt.Errorf("krun TAP networking and passt are mutually exclusive")
		}
		value, err := strconv.ParseInt(requested, 10, 32)
		if err != nil || value != 1 {
			return policy, fmt.Errorf("krun.use_passt must be 1 when present")
		}
		policy.UsePasst = 1
	}

	if requested, ok := annotations["krun.vsock_path"]; ok {
		policy.VsockPath, err = assignedKrunSocketPath(pluginID, requested, true)
		if err != nil {
			return policy, err
		}
		policy.VsockPort, err = parseKrunPolicyInt(annotations, "krun.vsock_port")
		if err != nil || policy.VsockPort == 0 {
			return policy, fmt.Errorf("krun.vsock_path requires a valid krun.vsock_port")
		}
	} else if _, ok := annotations["krun.vsock_port"]; ok {
		return policy, fmt.Errorf("krun.vsock_port requires krun.vsock_path")
	}

	if requested, ok := annotations["krun.vsock_connect_path"]; ok {
		policy.VsockConnectPath, err = assignedKrunSocketPath(pluginID, requested, false)
		if err != nil {
			return policy, err
		}
		policy.VsockConnectPort, err = parseKrunPolicyInt(annotations, "krun.vsock_connect_port")
		if err != nil || policy.VsockConnectPort == 0 {
			return policy, fmt.Errorf("krun.vsock_connect_path requires a valid krun.vsock_connect_port")
		}
	} else if _, ok := annotations["krun.vsock_connect_port"]; ok {
		return policy, fmt.Errorf("krun.vsock_connect_port requires krun.vsock_connect_path")
	}

	return policy, nil
}

func writeKrunJSONAtomic(path string, value interface{}, mode os.FileMode) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(mode); err != nil {
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
	return os.Rename(tmpPath, path)
}

func prepareKrunComposePolicy(composeFile string) (string, error) {
	pluginID, ok := krunPluginID(composeFile)
	if !ok {
		return "", nil
	}
	config, err := readKrunComposeConfig(composeFile)
	if err != nil {
		return "", err
	}

	services := []string{}
	for name, service := range config.Services {
		if service.Runtime == "spr-krun" {
			services = append(services, name)
		}
	}
	if len(services) != 1 {
		return "", fmt.Errorf("KVM plugin %s must define exactly one spr-krun service", pluginID)
	}
	sort.Strings(services)
	serviceName := services[0]
	service := config.Services[serviceName]
	policy, err := buildKrunTrustedPolicy(pluginID, serviceName, service.Annotations)
	if err != nil {
		return "", fmt.Errorf("authorize KVM plugin %s: %w", pluginID, err)
	}

	if err := ensurePrivateDirectory(krunPolicyDir); err != nil {
		return "", err
	}
	if err := ensurePrivateDirectory(krunOverrideDir); err != nil {
		return "", err
	}
	key, err := krunManagerKey()
	if err != nil {
		return "", err
	}
	token := krunPolicyToken(key, pluginID, serviceName)
	policyPath := filepath.Join(krunPolicyDir, token+".json")
	if err := writeKrunJSONAtomic(policyPath, policy, 0600); err != nil {
		return "", err
	}

	override := krunComposeOverride{Services: map[string]struct {
		Annotations map[string]string `yaml:"annotations"`
	}{}}
	overrideService := struct {
		Annotations map[string]string `yaml:"annotations"`
	}{Annotations: map[string]string{krunPolicyAnnotation: token}}
	override.Services[serviceName] = overrideService
	overridePath := filepath.Join(krunOverrideDir, token+".yml")
	data, err := yaml.Marshal(override)
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(overridePath+".tmp", data, 0600); err != nil {
		return "", err
	}
	if err := os.Rename(overridePath+".tmp", overridePath); err != nil {
		os.Remove(overridePath + ".tmp")
		return "", err
	}
	return overridePath, nil
}
