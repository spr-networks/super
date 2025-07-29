package main

import (
	"fmt"
	"testing"
)

func TestHostapdCtrlBasic(t *testing.T) {
	// Get list of AP interfaces
	ifaces := getAP_Ifaces()
	if len(ifaces) == 0 {
		t.Skip("No AP interfaces available for testing")
	}

	iface := ifaces[0]
	fmt.Printf("Testing with interface: %s\n", iface)

	// Test creating connection
	ctrl, err := NewHostapdCtrl(iface)
	if err != nil {
		t.Fatalf("Failed to create hostapd control connection: %v", err)
	}
	defer ctrl.Close()

	// Test getting status
	status, err := ctrl.GetStatus()
	if err != nil {
		t.Errorf("Failed to get status: %v", err)
	} else {
		fmt.Printf("Status: %+v\n", status)
	}

	// Test getting all stations
	stations, err := ctrl.GetAllStations()
	if err != nil {
		t.Errorf("Failed to get all stations: %v", err)
	} else {
		fmt.Printf("Stations: %+v\n", stations)
	}

	// Test sending raw command
	resp, err := ctrl.SendCommand("PING")
	if err != nil {
		t.Errorf("Failed to send PING command: %v", err)
	} else if resp != "PONG" {
		t.Errorf("Expected PONG response, got: %s", resp)
	} else {
		fmt.Println("PING/PONG test passed")
	}
}

func TestHostapdCtrlManager(t *testing.T) {
	ifaces := getAP_Ifaces()
	if len(ifaces) == 0 {
		t.Skip("No AP interfaces available for testing")
	}

	// Test getting multiple connections
	for _, iface := range ifaces {
		ctrl, err := hostapdCtrlManager.GetConnection(iface)
		if err != nil {
			t.Errorf("Failed to get connection for %s: %v", iface, err)
			continue
		}

		// Test sending command
		resp, err := ctrl.SendCommand("PING")
		if err != nil {
			t.Errorf("Failed to send PING to %s: %v", iface, err)
		} else if resp != "PONG" {
			t.Errorf("Expected PONG from %s, got: %s", iface, resp)
		}
	}

	// Test that we reuse connections
	ctrl1, _ := hostapdCtrlManager.GetConnection(ifaces[0])
	ctrl2, _ := hostapdCtrlManager.GetConnection(ifaces[0])
	if ctrl1 != ctrl2 {
		t.Error("Manager should reuse existing connections")
	}
}

func TestHostapdCtrlCompatibility(t *testing.T) {
	ifaces := getAP_Ifaces()
	if len(ifaces) == 0 {
		t.Skip("No AP interfaces available for testing")
	}

	iface := ifaces[0]

	// Test RunHostapdCommand with direct method
	resp1, err1 := RunHostapdCommandDirect(iface, "PING")
	if err1 != nil {
		t.Errorf("Direct command failed: %v", err1)
	}

	// Test RunHostapdCommand with exec method (by closing direct connection)
	hostapdCtrlManager.CloseAll()
	resp2, err2 := RunHostapdCommand(iface, "PING")
	if err2 != nil {
		t.Errorf("Exec command failed: %v", err2)
	}

	// Both should return PONG
	if resp1 != "PONG" || !contains(resp2, "PONG") {
		t.Errorf("Expected PONG responses, got direct=%s exec=%s", resp1, resp2)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && s[:len(substr)] == substr
}

func BenchmarkHostapdDirect(b *testing.B) {
	ifaces := getAP_Ifaces()
	if len(ifaces) == 0 {
		b.Skip("No AP interfaces available for benchmarking")
	}

	iface := ifaces[0]
	ctrl, err := hostapdCtrlManager.GetConnection(iface)
	if err != nil {
		b.Fatalf("Failed to get connection: %v", err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := ctrl.GetAllStations()
		if err != nil {
			b.Errorf("Failed to get stations: %v", err)
		}
	}
}

func BenchmarkHostapdExec(b *testing.B) {
	ifaces := getAP_Ifaces()
	if len(ifaces) == 0 {
		b.Skip("No AP interfaces available for benchmarking")
	}

	iface := ifaces[0]

	// Close direct connections to force exec method
	hostapdCtrlManager.CloseAll()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := RunHostapdCommand(iface, "all_sta")
		if err != nil {
			b.Errorf("Failed to run command: %v", err)
		}
	}
}
