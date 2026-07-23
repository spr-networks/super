package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAssignedKrunSocketPathIsConfined(t *testing.T) {
	first, err := assignedKrunSocketPath("/var/run/docker.sock", false)
	if err != nil {
		t.Fatal(err)
	}
	if first != "/run/spr-krun/connect/docker.sock" {
		t.Fatalf("unexpected assigned path %q", first)
	}
}

func TestAssignedKrunSocketPathRequiresSocketSuffix(t *testing.T) {
	path, err := assignedKrunSocketPath("/state/plugins/spr-acme/socket.sock", true)
	if err != nil {
		t.Fatal(err)
	}
	if path != "/run/spr-krun/listen/socket.sock" {
		t.Fatalf("unexpected assigned listener path %q", path)
	}
	if _, err := assignedKrunSocketPath("/state/plugins/spr-acme/socket", true); err == nil {
		t.Fatal("legacy suffixless socket name was accepted")
	}
}

func TestAuthorizedKrunSocketSourceUsesTrustedComposePath(t *testing.T) {
	source, err := authorizedKrunSocketSource("/state/plugins/plugin-a/api/socket.sock", true)
	if err != nil || source != "state/plugins/plugin-a/api" {
		t.Fatalf("valid listener rejected: %q %v", source, err)
	}
	source, err = authorizedKrunSocketSource("/state/plugins/plugin-b/socket.sock", true)
	if err != nil || source != "state/plugins/plugin-b" {
		t.Fatalf("trusted compose listener rejected: %q %v", source, err)
	}
	source, err = authorizedKrunSocketSource("/state/api/eventbus.sock", false)
	if err != nil || source != "state/api" {
		t.Fatalf("trusted compose connector rejected: %q %v", source, err)
	}
	for _, path := range []string{"state/api/eventbus.sock", "/state/api/../api/eventbus.sock", "/state/api/eventbus"} {
		if _, err := authorizedKrunSocketSource(path, false); err == nil {
			t.Fatalf("invalid trusted compose path accepted: %q", path)
		}
	}
}

func TestBuildKrunTrustedPolicyReplacesPrivilegedValues(t *testing.T) {
	annotations := map[string]string{
		"krun.tap_name":           "host0",
		"krun.net_uplink":         "lo",
		"krun.vsock_connect_path": "/state/api/eventbus.sock",
		"krun.vsock_connect_port": "2048",
		"krun.vsock_path":         "/etc/important.sock",
		"krun.vsock_port":         "2049",
	}
	policy, err := buildKrunTrustedPolicy("plugin-a", "service-a", annotations, "02:53:50:52:4b:21")
	if err != nil {
		t.Fatal(err)
	}
	if policy.TapName == "host0" || policy.NetMAC != "02:53:50:52:4b:21" {
		t.Fatal("manager did not apply its trusted TAP identity")
	}
	if strings.Contains(policy.VsockConnectPath, "/state/") || strings.Contains(policy.VsockPath, "/etc/") {
		t.Fatal("manager retained plugin-controlled host path")
	}
	if policy.VsockConnectPort != 2048 || policy.VsockPort != 2049 {
		t.Fatalf("safe guest ports were not retained: %#v", policy)
	}
}

func TestBuildKrunTrustedPolicyRejectsLegacyComposeMAC(t *testing.T) {
	annotations := map[string]string{
		"krun.tap_name":   "kruntap0",
		"krun.net_mac":    "02:53:50:52:4b:22",
		"krun.net_uplink": "eth0",
	}
	_, err := buildKrunTrustedPolicy("plugin-a", "service-a", annotations, "02:53:50:52:4b:22")
	if err == nil || !strings.Contains(err.Error(), "must be declared only") {
		t.Fatalf("legacy compose MAC was not rejected: %v", err)
	}
}

func TestBuildKrunTrustedPolicyUsesManifestMACWithoutComposeMAC(t *testing.T) {
	annotations := map[string]string{
		"krun.tap_name":   "kruntap0",
		"krun.net_uplink": "eth0",
	}
	policy, err := buildKrunTrustedPolicy("plugin-a", "service-a", annotations, "02:53:50:52:4b:21")
	if err != nil {
		t.Fatal(err)
	}
	if policy.NetMAC != "02:53:50:52:4b:21" {
		t.Fatalf("unexpected trusted policy MAC %q", policy.NetMAC)
	}
}

func TestReadKrunPluginDeviceMACUsesManifestNetworkCapability(t *testing.T) {
	originalRoot := SuperRootPath
	SuperRootPath = t.TempDir()
	t.Cleanup(func() { SuperRootPath = originalRoot })

	pluginDir := filepath.Join(SuperRootPath, "plugins", "user", "plugin-a")
	if err := os.MkdirAll(pluginDir, 0700); err != nil {
		t.Fatal(err)
	}
	manifest := `{"Runtime":"kvm","NetworkCapabilities":{"DeviceMAC":"02-53-50-52-4B-21"}}`
	if err := os.WriteFile(filepath.Join(pluginDir, "plugin.json"), []byte(manifest), 0600); err != nil {
		t.Fatal(err)
	}

	mac, err := readKrunPluginDeviceMAC("plugins/user/plugin-a/docker-compose-kvm.yml")
	if err != nil {
		t.Fatal(err)
	}
	if mac != "02:53:50:52:4b:21" {
		t.Fatalf("unexpected manager-approved MAC %q", mac)
	}
}

func TestKrunPolicyTokenIsBoundToPluginAndService(t *testing.T) {
	key := make([]byte, 32)
	a := krunPolicyToken(key, "plugin-a", "service")
	b := krunPolicyToken(key, "plugin-b", "service")
	c := krunPolicyToken(key, "plugin-a", "other")
	if len(a) != 64 || a == b || a == c || b == c {
		t.Fatalf("policy tokens are not independently bound: %q %q %q", a, b, c)
	}
}

func TestKrunPluginIDOnlyAcceptsManagedKVMCompose(t *testing.T) {
	if got, ok := krunPluginID("plugins/user/example/docker-compose-kvm.yml"); !ok || got != "example" {
		t.Fatalf("valid plugin rejected: %q %v", got, ok)
	}
	for _, path := range []string{
		"plugins/user/example/docker-compose.yml",
		"plugins/user/../example/docker-compose-kvm.yml",
		"custom/docker-compose-kvm.yml",
	} {
		if _, ok := krunPluginID(path); ok {
			t.Fatalf("unmanaged path accepted: %s", path)
		}
	}
}
