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
	"golang.org/x/sys/unix"
)

const (
	krunPolicyAnnotation = "run.oci.spr.krun.policy"
	krunPolicyRoot       = "/var/lib/spr-krun"
	krunPolicyDir        = krunPolicyRoot + "/policies"
	krunOverrideDir      = krunPolicyRoot + "/overrides"
	krunManagerKeyPath   = krunPolicyRoot + "/manager.key"
)

var krunSocketNameRE = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]*$`)

type krunComposeService struct {
	Runtime     string            `json:"runtime"`
	Annotations map[string]string `json:"annotations"`
}

type krunComposeConfig struct {
	Services map[string]krunComposeService `json:"services"`
}

type krunPluginManifest struct {
	Runtime             string `json:"Runtime"`
	NetworkCapabilities struct {
		DeviceMAC string `json:"DeviceMAC"`
	} `json:"NetworkCapabilities"`
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

type krunComposeOverrideService struct {
	Annotations map[string]string `yaml:"annotations"`
	Volumes     []string          `yaml:"volumes,omitempty"`
}

type krunComposeOverride struct {
	Services map[string]krunComposeOverrideService `yaml:"services"`
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

func normalizeKrunDeviceMAC(raw string) (string, error) {
	hardware, err := net.ParseMAC(strings.TrimSpace(raw))
	if err != nil || len(hardware) != 6 || hardware[0]&1 != 0 {
		return "", fmt.Errorf("KVM plugin DeviceMAC must be a six-octet unicast MAC address")
	}
	if hardware.String() == "00:00:00:00:00:00" {
		return "", fmt.Errorf("KVM plugin DeviceMAC must not be the zero address")
	}
	return hardware.String(), nil
}

func readKrunPluginDeviceMAC(composeFile string) (string, error) {
	manifestPath := filepath.Join(SuperRootPath, filepath.Dir(filepath.FromSlash(composeFile)), "plugin.json")
	info, err := os.Lstat(manifestPath)
	if err != nil {
		return "", fmt.Errorf("read manager-approved KVM plugin identity: %w", err)
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return "", fmt.Errorf("KVM plugin manifest is not a regular file: %s", manifestPath)
	}
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		return "", fmt.Errorf("read manager-approved KVM plugin identity: %w", err)
	}
	manifest := krunPluginManifest{}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return "", fmt.Errorf("parse KVM plugin manifest: %w", err)
	}
	if strings.ToLower(strings.TrimSpace(manifest.Runtime)) != "kvm" {
		return "", fmt.Errorf("KVM plugin manifest must select the kvm runtime")
	}
	hardware, err := normalizeKrunDeviceMAC(manifest.NetworkCapabilities.DeviceMAC)
	if err != nil {
		return "", err
	}
	return hardware, nil
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

func assignedKrunSocketPath(requestedPath string, listen bool) (string, error) {
	name := filepath.Base(requestedPath)
	if requestedPath == "" || name == "." || name == string(filepath.Separator) || !krunSocketNameRE.MatchString(name) {
		return "", fmt.Errorf("invalid krun socket name %q", requestedPath)
	}
	if !strings.HasSuffix(name, ".sock") {
		return "", fmt.Errorf("krun socket name must end in .sock: %q", requestedPath)
	}
	direction := "connect"
	if listen {
		direction = "listen"
	}
	path := filepath.Join("/run/spr-krun", direction, name)
	// sockaddr_un.sun_path is 108 bytes on Linux, including the trailing NUL.
	if len(path) >= 108 {
		return "", fmt.Errorf("assigned krun socket path is too long")
	}
	return path, nil
}

func authorizedKrunSocketSource(requestedPath string, listen bool) (string, error) {
	cleanPath := filepath.Clean(requestedPath)
	if requestedPath != cleanPath || !filepath.IsAbs(cleanPath) {
		return "", fmt.Errorf("krun socket path must be clean and absolute: %q", requestedPath)
	}
	if _, err := assignedKrunSocketPath(cleanPath, listen); err != nil {
		return "", err
	}

	parent := filepath.Dir(cleanPath)
	return strings.TrimPrefix(parent, string(filepath.Separator)), nil
}

func ensureKrunSocketSource(relativePath string) error {
	cleanPath := filepath.Clean(relativePath)
	if cleanPath == "." || filepath.IsAbs(cleanPath) || cleanPath == ".." || strings.HasPrefix(cleanPath, ".."+string(filepath.Separator)) {
		return fmt.Errorf("invalid krun socket source %q", relativePath)
	}

	flags := unix.O_RDONLY | unix.O_DIRECTORY | unix.O_CLOEXEC | unix.O_NOFOLLOW
	fd, err := unix.Open(SuperRootPath, flags, 0)
	if err != nil {
		return fmt.Errorf("open trusted super root: %w", err)
	}
	defer func() { _ = unix.Close(fd) }()

	for _, component := range strings.Split(cleanPath, string(filepath.Separator)) {
		if err := unix.Mkdirat(fd, component, 0700); err != nil && err != unix.EEXIST {
			return fmt.Errorf("create trusted krun socket directory %s: %w", component, err)
		}
		next, err := unix.Openat(fd, component, flags, 0)
		if err != nil {
			return fmt.Errorf("open trusted krun socket directory %s: %w", component, err)
		}
		var stat unix.Stat_t
		if err := unix.Fstat(next, &stat); err != nil {
			unix.Close(next)
			return fmt.Errorf("inspect trusted krun socket directory %s: %w", component, err)
		}
		if stat.Uid != 0 || stat.Mode&unix.S_IFMT != unix.S_IFDIR || stat.Mode&(unix.S_IWGRP|unix.S_IWOTH) != 0 {
			unix.Close(next)
			return fmt.Errorf("trusted krun socket directory %s must be root-owned and not writable by group or other", component)
		}
		unix.Close(fd)
		fd = next
	}
	return nil
}

func prepareKrunSocketMounts(annotations map[string]string) ([]string, error) {
	mounts := []string{}
	requests := []struct {
		annotation string
		target     string
		listen     bool
		readOnly   bool
	}{
		{"krun.vsock_path", "/run/spr-krun/listen", true, false},
		{"krun.vsock_connect_path", "/run/spr-krun/connect", false, true},
	}

	for _, request := range requests {
		requestedPath, ok := annotations[request.annotation]
		if !ok {
			continue
		}
		relativeSource, err := authorizedKrunSocketSource(requestedPath, request.listen)
		if err != nil {
			return nil, err
		}
		if err := ensureKrunSocketSource(relativeSource); err != nil {
			return nil, err
		}
		hostSource := filepath.Join(getHostSuperDir(), relativeSource)
		mount := hostSource + ":" + request.target
		if request.readOnly {
			mount += ":ro"
		}
		mounts = append(mounts, mount)
	}
	return mounts, nil
}

func buildKrunTrustedPolicy(pluginID, service string, annotations map[string]string, deviceMAC string) (krunTrustedPolicy, error) {
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
	_, hasUplink := annotations["krun.net_uplink"]
	if _, hasLegacyMAC := annotations["krun.net_mac"]; hasLegacyMAC {
		return policy, fmt.Errorf("krun.net_mac must be declared only as NetworkCapabilities.DeviceMAC in plugin.json")
	}
	if hasTap || hasUplink {
		if !hasTap || !hasUplink {
			return policy, fmt.Errorf("krun TAP networking request must include tap_name and net_uplink")
		}
		managerMAC, err := normalizeKrunDeviceMAC(deviceMAC)
		if err != nil {
			return policy, err
		}
		policy.TapName = krunPluginTap(pluginID)
		policy.NetMAC = managerMAC
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
		policy.VsockPath, err = assignedKrunSocketPath(requested, true)
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
		policy.VsockConnectPath, err = assignedKrunSocketPath(requested, false)
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
	deviceMAC := ""
	if _, hasTap := service.Annotations["krun.tap_name"]; hasTap {
		deviceMAC, err = readKrunPluginDeviceMAC(composeFile)
		if err != nil {
			return "", fmt.Errorf("authorize KVM plugin %s: %w", pluginID, err)
		}
	}
	policy, err := buildKrunTrustedPolicy(pluginID, serviceName, service.Annotations, deviceMAC)
	if err != nil {
		return "", fmt.Errorf("authorize KVM plugin %s: %w", pluginID, err)
	}
	socketMounts, err := prepareKrunSocketMounts(service.Annotations)
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

	override := krunComposeOverride{Services: map[string]krunComposeOverrideService{}}
	overrideService := krunComposeOverrideService{
		Annotations: map[string]string{krunPolicyAnnotation: token},
		Volumes:     socketMounts,
	}
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
