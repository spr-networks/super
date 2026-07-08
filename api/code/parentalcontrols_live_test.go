package main

import "testing"

func mapHasEntry(mapName, ip, iface string) bool {
	return GetElementFromMapComplex("inet", "filter", mapName, []string{ip, iface}) == nil
}

// TestParentalEnforceLiveNFT proves the enforcement primitive: blocking a
// persona's device removes only its internet_access entry, leaving lan_access
// and dns_access intact, and unblocking restores internet (device has wan).
func TestParentalEnforceLiveNFT(t *testing.T) {
	InitNFTClient()

	ip := "192.168.99.50"
	iface := "eth1"
	dev := DeviceEntry{
		MAC:               "aa:bb:cc:dd:ee:50",
		RecentIP:          ip,
		DHCPLastInterface: iface,
		Policies:          []string{"wan", "lan", "dns"},
		DeviceTags:        []string{"persona:test"},
	}

	addInternetVerdict(ip, iface)
	addLANVerdict(ip, iface)
	addDNSVerdict(ip, iface, "")
	t.Cleanup(func() {
		DeleteElementFromMapComplex("inet", "filter", "internet_access", []string{ip, iface})
		DeleteElementFromMapComplex("inet", "filter", "lan_access", []string{ip, iface})
		DeleteElementFromMapComplex("inet", "filter", "dns_access", []string{ip, iface})
	})

	if !mapHasEntry("internet_access", ip, iface) {
		t.Fatal("precondition: internet_access entry should exist")
	}

	// block: internet removed, lan + dns retained
	enforceDeviceInternet(dev, true)
	if mapHasEntry("internet_access", ip, iface) {
		t.Error("internet_access should be removed when blocked")
	}
	if !mapHasEntry("lan_access", ip, iface) {
		t.Error("lan_access must remain when only internet is blocked")
	}
	if !mapHasEntry("dns_access", ip, iface) {
		t.Error("dns_access must remain when only internet is blocked")
	}

	// unblock: internet restored (device carries the wan policy)
	enforceDeviceInternet(dev, false)
	if !mapHasEntry("internet_access", ip, iface) {
		t.Error("internet_access should be restored when unblocked")
	}

	// a device WITHOUT the wan policy must not be granted internet on unblock
	devNoWan := dev
	devNoWan.Policies = []string{"lan", "dns"}
	DeleteElementFromMapComplex("inet", "filter", "internet_access", []string{ip, iface})
	enforceDeviceInternet(devNoWan, false)
	if mapHasEntry("internet_access", ip, iface) {
		t.Error("device without wan policy must not get internet_access on unblock")
	}
}
