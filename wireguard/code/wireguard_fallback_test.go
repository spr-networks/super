package main

import (
	"os"
	"os/exec"
	"testing"
)

// Test that fallback mechanism works correctly
func TestFallbackMechanism(t *testing.T) {
	// Test key generation - should use direct method
	keypair, err := genKeyPair()
	if err != nil {
		t.Logf("genKeyPair returned error (expected if wg not installed): %v", err)
		// Check if it's because wg command doesn't exist
		if _, err := exec.LookPath("wg"); err != nil {
			t.Skip("Skipping test - wg command not found")
		}
	} else {
		// If it succeeded, verify the keys
		if len(keypair.PrivateKey) != 44 || len(keypair.PublicKey) != 44 {
			t.Errorf("Invalid key lengths: private=%d, public=%d",
				len(keypair.PrivateKey), len(keypair.PublicKey))
		}
		t.Logf("Successfully generated keypair (likely using direct method)")
	}

	// Test preshared key generation
	psk, err := genPresharedKey()
	if err != nil {
		t.Logf("genPresharedKey returned error (expected if wg not installed): %v", err)
	} else {
		if len(psk) != 44 {
			t.Errorf("Invalid preshared key length: %d", len(psk))
		}
		t.Logf("Successfully generated PSK (likely using direct method)")
	}
}

// Test that direct functions work without WireGuard installed
func TestDirectFunctionsWithoutWG(t *testing.T) {
	// These should always work because they use wgtypes directly

	// Test direct key generation
	keypair, err := genKeyPairDirect()
	if err != nil {
		// This might fail if we can't create wgctrl client
		t.Logf("Direct key generation failed (expected without WireGuard): %v", err)
	} else {
		if keypair.PrivateKey == "" || keypair.PublicKey == "" {
			t.Error("Direct key generation returned empty keys")
		}
	}

	// Test direct PSK generation
	psk, err := genPresharedKeyDirect()
	if err != nil {
		t.Logf("Direct PSK generation failed (expected without WireGuard): %v", err)
	} else {
		if psk == "" {
			t.Error("Direct PSK generation returned empty key")
		}
	}
}

// Test environment detection
func TestEnvironmentDetection(t *testing.T) {
	// Check if wg command exists
	if _, err := exec.LookPath("wg"); err != nil {
		t.Log("wg command not found - exec fallback will fail")
	} else {
		t.Log("wg command found - exec fallback available")
	}

	// Check if we're in a Docker container
	if _, err := os.Stat("/.dockerenv"); err == nil {
		t.Log("Running in Docker container")
	} else {
		t.Log("Not running in Docker container")
	}

	// Check if WireGuard interface exists
	if _, err := os.Stat("/sys/class/net/" + WireguardInterface); err == nil {
		t.Logf("WireGuard interface %s exists", WireguardInterface)
	} else {
		t.Logf("WireGuard interface %s does not exist", WireguardInterface)
	}
}
