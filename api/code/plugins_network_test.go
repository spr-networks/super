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
