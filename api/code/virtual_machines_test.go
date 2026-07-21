package main

import (
	"net"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

func TestVirtualMachineInfoRequestUsesSuperdSocket(t *testing.T) {
	socketDir, err := os.MkdirTemp("/tmp", "spr-api-vms-")
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
		if r.Method != http.MethodGet {
			t.Errorf("method = %q, want GET", r.Method)
		}
		if r.URL.Path != "/virtual_machines" {
			t.Errorf("path = %q, want /virtual_machines", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"KVMAvailable":true,"VirtualMachines":[]}`))
	})}
	go server.Serve(listener)

	originalSocketPath := SuperdSocketPath
	SuperdSocketPath = socketPath
	t.Cleanup(func() {
		SuperdSocketPath = originalSocketPath
		server.Close()
	})

	data, err := virtualMachineInfoRequest()
	if err != nil {
		t.Fatalf("virtualMachineInfoRequest() error = %v", err)
	}
	if got, want := string(data), `{"KVMAvailable":true,"VirtualMachines":[]}`; got != want {
		t.Fatalf("virtualMachineInfoRequest() = %q, want %q", got, want)
	}
}
