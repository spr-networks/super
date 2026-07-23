package main

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestPluginDeviceMAC(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{
			name:  "normalizes valid unicast MAC",
			input: " 02:53:50:52:4b:01 ",
			want:  "02:53:50:52:4b:01",
		},
		{
			name:  "normalizes hyphenated MAC",
			input: "02-53-50-52-4B-01",
			want:  "02:53:50:52:4b:01",
		},
		{
			name:    "rejects multicast MAC",
			input:   "01:00:5e:00:00:01",
			wantErr: true,
		},
		{
			name:    "rejects malformed MAC",
			input:   "02:53:50:52:40",
			wantErr: true,
		},
		{
			name:    "rejects zero MAC",
			input:   "00:00:00:00:00:00",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := pluginDeviceMAC(PluginConfig{
				Name: "test-plugin",
				NetworkCapabilities: NetworkCapabilities{
					DeviceMAC: tt.input,
				},
			})
			if tt.wantErr {
				if err == nil {
					t.Fatalf("pluginDeviceMAC(%q) unexpectedly succeeded", tt.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("pluginDeviceMAC(%q): %v", tt.input, err)
			}
			if got != tt.want {
				t.Fatalf("pluginDeviceMAC(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestNetworkCapabilitiesMatchesDeviceMAC(t *testing.T) {
	a := NetworkCapabilities{
		Interface: "kplugin0",
		DeviceMAC: "02:53:50:52:4b:01",
		Policies:  []string{"wan", "dns"},
	}
	b := a
	if !a.Matches(b) {
		t.Fatal("identical network capabilities should match")
	}
	b.DeviceMAC = "02:53:50:52:4b:02"
	if a.Matches(b) {
		t.Fatal("different device MACs should not match")
	}
}

func TestNewPluginDeviceType(t *testing.T) {
	dev := newPluginDevice(
		PluginConfig{Name: "test-plugin"},
		"02:53:50:52:4b:01",
	)
	if dev.Type != DeviceTypeContainer {
		t.Fatalf("plugin device Type = %q, want %q", dev.Type, DeviceTypeContainer)
	}

	data, err := json.Marshal(dev)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `"Type":"Container"`) {
		t.Fatalf("serialized plugin device has no container type: %s", data)
	}

	data, err = json.Marshal(DeviceEntry{Name: "client"})
	if err != nil {
		t.Fatal(err)
	}
	var serialized map[string]json.RawMessage
	if err := json.Unmarshal(data, &serialized); err != nil {
		t.Fatal(err)
	}
	if _, exists := serialized["Type"]; exists {
		t.Fatalf("untyped client serialized a Type field: %s", data)
	}
}

func TestPluginDeviceNetworkRejectsLongInterfaceName(t *testing.T) {
	err := preparePluginDeviceNetworkCapabilities(PluginConfig{
		Name: "test-plugin",
		NetworkCapabilities: NetworkCapabilities{
			Interface: "kpluginname00000",
			DeviceMAC: "02:53:50:52:4b:01",
			Policies:  []string{"wan"},
		},
	})
	if err == nil {
		t.Fatal("interface names at IFNAMSIZ should be rejected")
	}
}

func TestAuthorizedPluginDeviceLinkRequiresDeclarationAndDHCP(t *testing.T) {
	const (
		mac   = "02:53:50:52:4b:01"
		iface = "lo"
	)

	if !isAuthorizedPluginDeviceLink(
		mac,
		iface,
		map[string]string{mac: iface},
		map[string]string{mac: iface},
	) {
		t.Fatal("declared link with matching DHCP interface should be authorized")
	}
	if isAuthorizedPluginDeviceLink(
		mac,
		iface,
		map[string]string{mac: "other0"},
		map[string]string{mac: iface},
	) {
		t.Fatal("link without matching DHCP observation should not be authorized")
	}
	if isAuthorizedPluginDeviceLink(
		mac,
		iface,
		map[string]string{mac: iface},
		map[string]string{},
	) {
		t.Fatal("DHCP observation without plugin declaration should not be authorized")
	}
}

func TestPluginDeviceIPFromPersistedLease(t *testing.T) {
	const mac = "02:53:50:52:4b:01"
	plugin := PluginConfig{
		Name: "test-plugin",
		NetworkCapabilities: NetworkCapabilities{
			Interface: "kplugin0",
		},
	}
	devices := map[string]DeviceEntry{
		mac: {
			Type:              DeviceTypeContainer,
			MAC:               mac,
			RecentIP:          "10.168.0.42",
			DHCPLastInterface: "kplugin0",
		},
	}

	got, err := pluginDeviceIPFromDevices(plugin, mac, devices)
	if err != nil {
		t.Fatal(err)
	}
	if got != "10.168.0.42" {
		t.Fatalf("plugin device IP = %q, want 10.168.0.42", got)
	}

	dev := devices[mac]
	dev.DHCPLastInterface = "docker0"
	devices[mac] = dev
	if _, err := pluginDeviceIPFromDevices(plugin, mac, devices); err == nil {
		t.Fatal("stale Docker interface lease unexpectedly accepted")
	}
}

func TestPluginStartPreparesDeviceNetworkFirst(t *testing.T) {
	plugin := PluginConfig{
		Name: "test-plugin",
		NetworkCapabilities: NetworkCapabilities{
			Interface: "kplugin0",
			DeviceMAC: "02:53:50:52:4b:01",
			Policies:  []string{"wan"},
		},
	}
	events := []string{}
	started := runPluginStartWithNetworkPreparer(
		plugin,
		func(got PluginConfig) error {
			events = append(events, "prepare")
			return nil
		},
		func() bool {
			events = append(events, "start")
			return true
		},
	)
	if !started {
		t.Fatal("prepared plugin did not start")
	}
	if len(events) != 2 || events[0] != "prepare" || events[1] != "start" {
		t.Fatalf("plugin lifecycle order = %v, want [prepare start]", events)
	}
}

func TestPluginStartStopsWhenDeviceAuthorizationFails(t *testing.T) {
	startCalled := false
	started := runPluginStartWithNetworkPreparer(
		PluginConfig{Name: "test-plugin"},
		func(PluginConfig) error {
			return errors.New("authorization failed")
		},
		func() bool {
			startCalled = true
			return true
		},
	)
	if started {
		t.Fatal("plugin unexpectedly started after authorization failure")
	}
	if startCalled {
		t.Fatal("start action ran after authorization failure")
	}
}
