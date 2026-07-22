package main

import (
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestPluginDeviceNetworkOnlyAppliesToKVMRuntime(t *testing.T) {
	plugin := PluginConfig{
		ComposeFilePath: "plugins/user/spr-test/docker-compose-kvm.yml",
		Runtime:         pluginRuntimeKVM,
		NetworkCapabilities: NetworkCapabilities{
			DeviceMAC: "02:53:50:52:4b:12",
		},
	}
	if !pluginUsesDeviceNetwork(plugin) {
		t.Fatal("KVM plugin did not use its declared device network")
	}

	plugin.Runtime = pluginRuntimeDefault
	plugin.ComposeFilePath = "plugins/user/spr-test/docker-compose.yml"
	if pluginUsesDeviceNetwork(plugin) {
		t.Fatal("default runtime retained KVM device networking")
	}
}

func TestPluginInstallInfoOffersDefaultWhenKVMIsUnavailable(t *testing.T) {
	socketDir, err := os.MkdirTemp("/tmp", "spr-api-runtime-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(socketDir) })
	socketPath := filepath.Join(socketDir, "superd.sock")
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatal(err)
	}

	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.Path != "/plugin_runtime_status" {
			http.NotFound(w, r)
			return
		}
		if got := r.URL.Query().Get("runtime"); got != pluginRuntimeKVM {
			t.Errorf("runtime = %q, want %q", got, pluginRuntimeKVM)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"Runtime":"kvm","Ready":false,"Reason":"spr-krun is missing"}`))
	})}
	go server.Serve(listener)

	originalSocketPath := SuperdSocketPath
	SuperdSocketPath = socketPath
	t.Cleanup(func() {
		SuperdSocketPath = originalSocketPath
		server.Close()
	})

	info, err := pluginInstallInfo(PluginConfig{
		Name:              "spr-test",
		Runtime:           pluginRuntimeKVM,
		ComposeFilePath:   "plugins/user/spr-test/docker-compose-kvm.yml",
		AvailableRuntimes: []string{pluginRuntimeDefault, pluginRuntimeKVM},
	})
	if err != nil {
		t.Fatal(err)
	}
	if info.RuntimeReady {
		t.Fatal("RuntimeReady = true, want false")
	}
	if info.FallbackRuntime != pluginRuntimeDefault {
		t.Fatalf("FallbackRuntime = %q", info.FallbackRuntime)
	}
	if got, want := info.FallbackComposeFilePath, "plugins/user/spr-test/docker-compose.yml"; got != want {
		t.Fatalf("FallbackComposeFilePath = %q, want %q", got, want)
	}
}

func TestRestorePluginDHCPInterfaces(t *testing.T) {
	const mac = "02:53:50:52:4b:12"
	devices := map[string]DeviceEntry{
		mac: {
			Type:              DeviceTypeContainer,
			DHCPLastInterface: "spr-usque",
		},
	}
	links := map[string]string{mac: "spr-usque"}

	restored := restorePluginDHCPInterfaces(devices, map[string]string{}, links)
	if restored[mac] != "spr-usque" {
		t.Fatalf("restored interface = %q, want spr-usque", restored[mac])
	}

	restored = restorePluginDHCPInterfaces(devices, map[string]string{mac: "eth1"}, links)
	if restored[mac] != "eth1" {
		t.Fatalf("newer interface = %q, want eth1", restored[mac])
	}

	device := devices[mac]
	device.Type = ""
	devices[mac] = device
	restored = restorePluginDHCPInterfaces(devices, map[string]string{}, links)
	if restored[mac] != "" {
		t.Fatalf("client interface restored as %q", restored[mac])
	}

	device.Type = DeviceTypeContainer
	devices[mac] = device
	restored = restorePluginDHCPInterfaces(devices, map[string]string{}, map[string]string{mac: "other0"})
	if restored[mac] != "" {
		t.Fatalf("mismatched plugin interface restored as %q", restored[mac])
	}
}
