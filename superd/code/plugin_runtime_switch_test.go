package main

import (
	"net"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
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

func TestPluginRuntimeHostStatus(t *testing.T) {
	status, err := getPluginRuntimeHostStatus(pluginRuntimeDefault)
	if err != nil || !status.Ready {
		t.Fatalf("default runtime status = %#v, %v", status, err)
	}

	socketDir, err := os.MkdirTemp("/tmp", "spr-superd-runtime-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(socketDir) })
	socketPath := filepath.Join(socketDir, "docker.sock")
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatal(err)
	}

	dockerInfo := `{"Runtimes":{"runc":{"path":"runc"}}}`
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/info" {
			http.NotFound(w, r)
			return
		}
		w.Write([]byte(dockerInfo))
	})}
	go server.Serve(listener)

	originalSocketPath := DockerSocketPath
	DockerSocketPath = socketPath
	t.Cleanup(func() {
		DockerSocketPath = originalSocketPath
		server.Close()
	})

	status, err = getPluginRuntimeHostStatus(pluginRuntimeKVM)
	if err != nil {
		t.Fatal(err)
	}
	if status.Ready || !strings.Contains(status.Reason, "spr-krun") {
		t.Fatalf("missing spr-krun status = %#v", status)
	}

	dockerInfo = `{"Runtimes":{"runc":{"path":"runc"},"spr-krun":{"path":"spr-krun"}}}`
	status, err = getPluginRuntimeHostStatus(pluginRuntimeKVM)
	if err != nil || !status.Ready || status.Reason != "" {
		t.Fatalf("installed spr-krun status = %#v, %v", status, err)
	}
}
