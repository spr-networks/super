package main

import (
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestResolveUserPluginRuntime(t *testing.T) {
	originalRoot := SuperRootPath
	SuperRootPath = t.TempDir()
	t.Cleanup(func() { SuperRootPath = originalRoot })

	pluginDir := filepath.Join(SuperRootPath, "plugins", "user", "spr-test")
	if err := os.MkdirAll(pluginDir, 0755); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"docker-compose.yml", "docker-compose-kvm.yml"} {
		if err := os.WriteFile(filepath.Join(pluginDir, name), []byte("services: {}\n"), 0600); err != nil {
			t.Fatal(err)
		}
	}

	selection, err := resolveUserPluginRuntime(
		"plugins/user/spr-test/docker-compose-kvm.yml",
		pluginRuntimeDefault,
	)
	if err != nil {
		t.Fatal(err)
	}
	if selection.ComposeFilePath != "plugins/user/spr-test/docker-compose.yml" {
		t.Fatalf("ComposeFilePath = %q", selection.ComposeFilePath)
	}
	if !slices.Equal(selection.AvailableRuntimes, []string{pluginRuntimeDefault, pluginRuntimeKVM}) {
		t.Fatalf("AvailableRuntimes = %v", selection.AvailableRuntimes)
	}

	if _, err := resolveUserPluginRuntime("docker-compose.yml", pluginRuntimeKVM); err == nil {
		t.Fatal("accepted a non-plugin compose path")
	}
}
