package main

import (
	"reflect"
	"testing"
)

func TestPluginContainerIPFromNetwork(t *testing.T) {
	data := []byte(`{"Containers":{"container-id":{"IPv4Address":"172.30.117.3/24"}}}`)

	got, err := pluginContainerIPFromNetwork(data)
	if err != nil {
		t.Fatalf("pluginContainerIPFromNetwork() error = %v", err)
	}
	if got != "172.30.117.3" {
		t.Fatalf("pluginContainerIPFromNetwork() = %q, want %q", got, "172.30.117.3")
	}
}

func TestDockerNetworkIDsForBridge(t *testing.T) {
	data := []byte(`[
		{"Id":"unrelated","Name":"other_default","Options":{"com.docker.network.bridge.name":"other"}},
		{"Id":"network-id","Name":"spr-dnscrypt_dnscryptnet","Options":{"com.docker.network.bridge.name":"spr-dnscrypt"}}
	]`)

	got, err := dockerNetworkIDsForBridge(data, "spr-dnscrypt")
	if err != nil {
		t.Fatalf("dockerNetworkIDsForBridge() error = %v", err)
	}
	want := []string{"network-id"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("dockerNetworkIDsForBridge() = %v, want %v", got, want)
	}
}

func TestDockerNetworkIDsForBridgeMissing(t *testing.T) {
	_, err := dockerNetworkIDsForBridge([]byte(`[]`), "spr-dnscrypt")
	if err == nil {
		t.Fatal("dockerNetworkIDsForBridge() error = nil, want an error")
	}
}

func TestCheckCurrentPluginNetworkRules(t *testing.T) {
	desired := CustomInterfaceRule{
		BaseRule:  BaseRule{RuleName: "Plugin-spr-atlas"},
		Interface: "spr-atlas",
		SrcIP:     "172.26.0.2",
		Policies:  []string{"wan", "dns"},
		Groups:    []string{},
		Tags:      []string{},
	}
	rules := []CustomInterfaceRule{
		{
			BaseRule:  BaseRule{RuleName: "Plugin-spr-nebula"},
			Interface: "spr-nebula",
			SrcIP:     "172.23.0.2",
		},
		{
			BaseRule:  BaseRule{RuleName: "Plugin-spr-atlas"},
			Interface: "spr-atlas",
			SrcIP:     "172.29.0.2",
			Policies:  []string{"wan", "dns"},
			Groups:    []string{},
			Tags:      []string{},
		},
		{
			BaseRule:  BaseRule{RuleName: "Plugin-spr-atlas"},
			Interface: "spr-atlas",
			SrcIP:     "172.26.0.2",
			Policies:  []string{"dns"},
			Groups:    []string{},
			Tags:      []string{},
		},
		desired,
	}

	hasCurrent, stale := checkCurrentPluginNetworkRules(rules, desired)
	if !hasCurrent {
		t.Fatal("checkCurrentPluginNetworkRules() hasCurrent = false, want true")
	}
	if len(stale) != 2 {
		t.Fatalf("checkCurrentPluginNetworkRules() stale count = %d, want 2", len(stale))
	}
	if stale[0].SrcIP != "172.29.0.2" {
		t.Fatalf("first stale SrcIP = %q, want %q", stale[0].SrcIP, "172.29.0.2")
	}
}
