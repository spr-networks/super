package main

import (
	"fmt"
	"os/exec"
	"testing"
	"time"
)

func TestWireGuardCtrlBasic(t *testing.T) {
	// Create a new WireGuard control client
	ctrl, err := NewWireGuardCtrl(WireguardInterface)
	if err != nil {
		t.Skipf("Failed to create WireGuard control client (may need root): %v", err)
	}
	defer ctrl.Close()

	// Test getting device info
	device, err := ctrl.GetDevice()
	if err != nil {
		t.Errorf("Failed to get device: %v", err)
	} else {
		fmt.Printf("Device: %s\n", WireguardInterface)
		fmt.Printf("Public Key: %s\n", device.PublicKey.String())
		fmt.Printf("Listen Port: %d\n", device.ListenPort)
		fmt.Printf("Peers: %d\n", len(device.Peers))
	}
}

func TestKeyGeneration(t *testing.T) {
	ctrl, err := NewWireGuardCtrl(WireguardInterface)
	if err != nil {
		t.Skipf("Failed to create WireGuard control client: %v", err)
	}
	defer ctrl.Close()

	// Test key pair generation
	keypair, err := ctrl.GenKeyPair()
	if err != nil {
		t.Errorf("Failed to generate key pair: %v", err)
	} else {
		if len(keypair.PrivateKey) != 44 || len(keypair.PublicKey) != 44 {
			t.Errorf("Invalid key lengths: private=%d, public=%d",
				len(keypair.PrivateKey), len(keypair.PublicKey))
		}
		fmt.Printf("Generated keypair:\n")
		fmt.Printf("  Private: %s\n", keypair.PrivateKey)
		fmt.Printf("  Public: %s\n", keypair.PublicKey)
	}

	// Test preshared key generation
	psk, err := ctrl.GenPresharedKey()
	if err != nil {
		t.Errorf("Failed to generate preshared key: %v", err)
	} else {
		if len(psk) != 44 {
			t.Errorf("Invalid preshared key length: %d", len(psk))
		}
		fmt.Printf("Generated PSK: %s\n", psk)
	}
}

func TestGetStatus(t *testing.T) {
	ctrl, err := NewWireGuardCtrl(WireguardInterface)
	if err != nil {
		t.Skipf("Failed to create WireGuard control client: %v", err)
	}
	defer ctrl.Close()

	// Test getting status
	status, err := ctrl.GetStatus()
	if err != nil {
		t.Errorf("Failed to get status: %v", err)
	} else {
		fmt.Printf("Status: %+v\n", status)

		// Test JSON conversion
		jsonData, err := getWireGuardStatusDirect()
		if err != nil {
			t.Errorf("Failed to get JSON status: %v", err)
		} else {
			fmt.Printf("JSON output:\n%s\n", jsonData)
		}
	}
}

func TestCompatibility(t *testing.T) {
	// Test that the fallback mechanism works

	// Test genKeyPair
	start := time.Now()
	keypair, err1 := genKeyPair() // Uses direct method with fallback
	directTime := time.Since(start)

	if err1 != nil {
		t.Errorf("genKeyPair failed: %v", err1)
	} else {
		fmt.Printf("Generated keypair in %v\n", directTime)
		fmt.Printf("  Public: %s\n", keypair.PublicKey)
	}

	// Test getPeers
	start = time.Now()
	peers, err2 := getPeers() // Uses direct method with fallback
	peersTime := time.Since(start)

	if err2 != nil {
		t.Errorf("getPeers failed: %v", err2)
	} else {
		fmt.Printf("Found %d peers in %v\n", len(peers), peersTime)
	}

	fmt.Printf("Key generation time: %v\n", directTime)
}

func BenchmarkWgctrlDirect(b *testing.B) {
	ctrl, err := NewWireGuardCtrl(WireguardInterface)
	if err != nil {
		b.Skipf("Failed to create WireGuard control client: %v", err)
	}
	defer ctrl.Close()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := ctrl.GetPeers()
		if err != nil {
			b.Errorf("Failed to get peers: %v", err)
		}
	}
}

func BenchmarkExecMethod(b *testing.B) {
	// Force using exec method by not using the direct functions
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		cmd := exec.Command("wg", "show", WireguardInterface, "dump")
		_, err := cmd.Output()
		if err != nil {
			b.Errorf("Failed to run wg command: %v", err)
		}
	}
}
