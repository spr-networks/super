package main

import (
	"encoding/json"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"
	"testing"
)

// Test that key generation works without needing WireGuard installed
func TestKeyGenerationUnit(t *testing.T) {
	// Test wgtypes key generation directly
	privateKey, err := wgtypes.GeneratePrivateKey()
	if err != nil {
		t.Fatalf("Failed to generate private key: %v", err)
	}

	publicKey := privateKey.PublicKey()

	// Verify key formats
	if len(privateKey.String()) != 44 {
		t.Errorf("Invalid private key length: %d", len(privateKey.String()))
	}

	if len(publicKey.String()) != 44 {
		t.Errorf("Invalid public key length: %d", len(publicKey.String()))
	}

	// Test preshared key generation
	psk, err := wgtypes.GenerateKey()
	if err != nil {
		t.Fatalf("Failed to generate preshared key: %v", err)
	}

	if len(psk.String()) != 44 {
		t.Errorf("Invalid preshared key length: %d", len(psk.String()))
	}
}

// Test the wrapper functions
func TestWrapperFunctions(t *testing.T) {
	// These should work even without WireGuard installed
	// because they use wgtypes directly

	ctrl := &WireGuardCtrl{}

	// Test GenKeyPair
	keypair, err := ctrl.GenKeyPair()
	if err != nil {
		t.Fatalf("GenKeyPair failed: %v", err)
	}

	if keypair.PrivateKey == "" || keypair.PublicKey == "" {
		t.Error("GenKeyPair returned empty keys")
	}

	// Test GenPresharedKey
	psk, err := ctrl.GenPresharedKey()
	if err != nil {
		t.Fatalf("GenPresharedKey failed: %v", err)
	}

	if psk == "" {
		t.Error("GenPresharedKey returned empty key")
	}
}

// Test JSON serialization
func TestJSONSerialization(t *testing.T) {
	status := WireGuardStatus{
		PublicKey:  "test-public-key",
		ListenPort: 51820,
		Peers: map[string]WireGuardPeerInfo{
			"peer-public-key": {
				Endpoint:            "192.168.1.100:51820",
				LatestHandshake:     1234567890,
				TransferRx:          1000,
				TransferTx:          2000,
				PersistentKeepalive: 25,
				AllowedIPs:          []string{"10.0.0.2/32"},
			},
		},
	}

	result := map[string]WireGuardStatus{
		"wg0": status,
	}

	// Test that it can be serialized
	jsonData, err := json.MarshalIndent(result, "", "\t")
	if err != nil {
		t.Fatalf("Failed to marshal status: %v", err)
	}

	if len(jsonData) == 0 {
		t.Error("JSON serialization produced empty output")
	}

	// Verify structure
	var decoded map[string]WireGuardStatus
	if err := json.Unmarshal(jsonData, &decoded); err != nil {
		t.Fatalf("Failed to unmarshal status: %v", err)
	}

	if decoded["wg0"].PublicKey != status.PublicKey {
		t.Error("Public key mismatch after serialization")
	}
}
