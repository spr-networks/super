package main

import "testing"

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
