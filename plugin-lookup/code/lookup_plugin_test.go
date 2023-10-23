package main

import (
	"testing"
)

func TestASN(t *testing.T) {
	err := initDb()
	if err != nil {
		t.Fatalf("initDb error: %v", err)
	}

	ip := "1.0.4.1"
	result, err := lookupASN(ip)

	if err != nil {
		t.Fatalf("newClient error: %v", err)
	}

	if result.Name != "WPL-AS-AP Wirefreebroadband Pty Ltd" {
		t.Fatalf("asn: empty result for ip")
	}
}

func TestOUI(t *testing.T) {
	err := initDb()
	if err != nil {
		t.Fatalf("initDb error: %v", err)
	}

	mac := "B8:27:EB:11:22:33"
	vendor, err := mOUI.VendorLookup(mac)

	//B8:27:EB        RaspberryPiF    # Raspberry Pi Foundation
	if err != nil {
		t.Fatalf("oui error: %v", err)
	}

	if vendor != "Raspberry Pi Foundation" {
		t.Fatalf("oui: empty result for mac: %v", vendor)
	}
}
