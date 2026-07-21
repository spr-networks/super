package main

import (
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestDiscoverVirtualMachinesIncludesNativeAndContainerVMs(t *testing.T) {
	debugfsPath := t.TempDir()
	if err := os.Mkdir(filepath.Join(debugfsPath, "1234-7"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(debugfsPath, "5678-9"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(debugfsPath, "not-a-vm"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(debugfsPath, "exits"), []byte("0"), 0644); err != nil {
		t.Fatal(err)
	}

	socketDir, err := os.MkdirTemp("/tmp", "spr-superd-vms-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(socketDir) })
	socketPath := filepath.Join(socketDir, "docker.sock")
	listener, err := net.Listen("unix", socketPath)
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/containers/json":
			w.Write([]byte(`[{"Id":"container-id"}]`))
		case "/containers/container-id/json":
			w.Write([]byte(`{
				"Id":"container-id",
				"Name":"/spr-atlas",
				"Config":{"Image":"ghcr.io/spr-networks/spr-atlas:latest-krun"},
				"State":{"Pid":1234,"Status":"running","StartedAt":"2026-07-21T21:49:38Z"},
				"HostConfig":{"Runtime":"spr-krun","Annotations":{"krun.cpus":"1","krun.ram_mib":"128"}}
			}`))
		default:
			http.NotFound(w, r)
		}
	})}
	go server.Serve(listener)

	originalDebugfsPath := KVM_DEBUGFS_PATH
	originalDockerSocketPath := DockerSocketPath
	KVM_DEBUGFS_PATH = debugfsPath
	DockerSocketPath = socketPath
	t.Cleanup(func() {
		KVM_DEBUGFS_PATH = originalDebugfsPath
		DockerSocketPath = originalDockerSocketPath
		server.Close()
	})

	inventory := discoverVirtualMachines()
	if !inventory.KVMAvailable {
		t.Fatal("KVMAvailable = false, want true")
	}
	if !inventory.ContainerMetadataAvailable {
		t.Fatal("ContainerMetadataAvailable = false, want true")
	}
	if got, want := len(inventory.VirtualMachines), 2; got != want {
		t.Fatalf("len(VirtualMachines) = %d, want %d", got, want)
	}

	byPID := map[int]VirtualMachineInfo{}
	for _, vm := range inventory.VirtualMachines {
		byPID[vm.PID] = vm
	}

	containerVM := byPID[1234]
	if containerVM.Name != "spr-atlas" || !containerVM.Container {
		t.Fatalf("container VM = %#v", containerVM)
	}
	if containerVM.Runtime != "spr-krun" || containerVM.CPUs != 1 || containerVM.MemoryMiB != 128 {
		t.Fatalf("container VM metadata = %#v", containerVM)
	}

	nativeVM := byPID[5678]
	if nativeVM.Name != "KVM VM 5678-9" || nativeVM.Container {
		t.Fatalf("native VM = %#v", nativeVM)
	}
}

func TestDiscoverVirtualMachinesReportsUnavailableDebugfs(t *testing.T) {
	originalDebugfsPath := KVM_DEBUGFS_PATH
	KVM_DEBUGFS_PATH = filepath.Join(t.TempDir(), "missing")
	t.Cleanup(func() { KVM_DEBUGFS_PATH = originalDebugfsPath })

	inventory := discoverVirtualMachines()
	if inventory.KVMAvailable {
		t.Fatal("KVMAvailable = true, want false")
	}
	if inventory.Error == "" {
		t.Fatal("Error is empty")
	}
	if inventory.VirtualMachines == nil {
		t.Fatal("VirtualMachines is nil, want an empty JSON array")
	}
}
