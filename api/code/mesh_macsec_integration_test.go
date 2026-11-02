package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

const (
	itLeafMAC    = "02:aa:bb:cc:dd:01"
	itLeafIP     = "192.168.2.10"
	itNewLeafMAC = "02:aa:bb:cc:dd:99"
	itStaMAC     = "02:aa:bb:cc:dd:03"
	itStaIP      = "192.168.2.14"
	itGuestMAC   = "02:aa:bb:cc:dd:04"
	itWiredMAC   = "02:aa:bb:cc:dd:05"
)

func itStrictState() MeshMACsecState {
	return MeshMACsecState{Role: "main", Strict: true, Links: []MeshMACsecLink{
		{LeafIP: itLeafIP, Interface: "macsec0", Parent: "eth0", LeafMAC: itLeafMAC, Secured: true},
	}}
}

func withMeshMACsecState(t *testing.T, s MeshMACsecState) {
	t.Helper()
	MeshMACsecmtx.Lock()
	old := gMeshMACsec
	gMeshMACsec = s
	MeshMACsecmtx.Unlock()
	t.Cleanup(func() {
		MeshMACsecmtx.Lock()
		gMeshMACsec = old
		MeshMACsecmtx.Unlock()
	})
}

func forgetRecentDHCP(t *testing.T, macs ...string) {
	t.Cleanup(func() {
		FWmtx.Lock()
		for _, mac := range macs {
			delete(RecentDHCPIface, mac)
		}
		FWmtx.Unlock()
	})
}

func dhcpAs(t *testing.T, mac string, iface string) *httptest.ResponseRecorder {
	t.Helper()
	payload, _ := json.Marshal(DHCPRequest{MAC: mac, Iface: iface, Name: "macsec-it"})
	rec := httptest.NewRecorder()
	dhcpRequest(rec, httptest.NewRequest(http.MethodPut, "/dhcp", bytes.NewReader(payload)))
	return rec
}

func recentDHCPIface(mac string) string {
	FWmtx.Lock()
	defer FWmtx.Unlock()
	return RecentDHCPIface[mac]
}

func TestDHCPRequestEnforcesMeshMACsec(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)
	forgetRecentDHCP(t, itLeafMAC, itNewLeafMAC, itStaMAC, itGuestMAC, itWiredMAC)
	DHCPmtx.Lock()
	oldDHCP := gDhcpConfig
	gDhcpConfig.TinyNets = []string{"192.168.2.0/24"}
	gDhcpConfig.LeaseTime = "24h0m0s"
	DHCPmtx.Unlock()
	t.Cleanup(func() {
		DHCPmtx.Lock()
		gDhcpConfig = oldDHCP
		DHCPmtx.Unlock()
	})

	Devicesmtx.Lock()
	saveDevicesJson(map[string]DeviceEntry{
		itLeafMAC:    {MAC: itLeafMAC, RecentIP: itLeafIP, Name: "leaf"},
		itNewLeafMAC: {MAC: itNewLeafMAC, RecentIP: itLeafIP, Name: "leaf-new-mac"},
		itStaMAC:     {MAC: itStaMAC, RecentIP: itStaIP, Name: "station", PSKEntry: PSKEntry{Type: "sae", Psk: "password1"}},
		itGuestMAC:   {MAC: itGuestMAC, RecentIP: "192.168.2.18", Name: "guest", Policies: []string{"wan", "dns", "noapi", "guestonly"}},
		itWiredMAC:   {MAC: itWiredMAC, RecentIP: "192.168.2.22", Name: "wired"},
	})
	Devicesmtx.Unlock()
	withMeshMACsecState(t, itStrictState())

	refused := []struct {
		name, mac, iface string
	}{
		{"spoofed leaf MAC on the raw downlink", itLeafMAC, "eth0"},
		{"spoofed leaf MAC on a wired VLAN", itLeafMAC, "eth0.100"},
		{"another MAC holding the leaf IP", itNewLeafMAC, "eth0"},
		{"spoofed Wi-Fi station on the raw downlink", itStaMAC, "eth0"},
		{"spoofed mesh guest on the raw downlink", itGuestMAC, "eth0"},
	}
	for _, c := range refused {
		if rec := dhcpAs(t, c.mac, c.iface); rec.Code != http.StatusForbidden {
			t.Errorf("%s: DHCP status %d, want 403", c.name, rec.Code)
		}
		if got := recentDHCPIface(c.mac); got == c.iface {
			t.Errorf("%s: refused request still recorded %s as the device interface", c.name, got)
		}
		if err := GetMACVerdictElement("inet", "filter", "ethernet_filter", itLeafIP, c.iface, c.mac, "return"); err == nil {
			t.Errorf("%s: refused request installed an ethernet_filter entry", c.name)
		}
	}

	if rec := dhcpAs(t, itWiredMAC, "eth0"); rec.Code != http.StatusOK {
		t.Errorf("wired device refused on the raw downlink: %d %s", rec.Code, rec.Body)
	}
	rec := dhcpAs(t, itLeafMAC, "macsec0")
	if rec.Code != http.StatusOK {
		t.Fatalf("leaf refused on its secY: %d %s", rec.Code, rec.Body)
	}
	reply := DHCPResponse{}
	json.Unmarshal(rec.Body.Bytes(), &reply)
	if reply.IP != itLeafIP || recentDHCPIface(itLeafMAC) != "macsec0" {
		t.Errorf("leaf lease %+v iface %q", reply, recentDHCPIface(itLeafMAC))
	}
	if rec := dhcpAs(t, itStaMAC, "macsec0"); rec.Code != http.StatusOK {
		t.Errorf("station behind the MACsec leaf refused: %d %s", rec.Code, rec.Body)
	}

	withMeshMACsecState(t, MeshMACsecState{})
	if rec := dhcpAs(t, itStaMAC, "eth0"); rec.Code != http.StatusOK {
		t.Errorf("without MACsec, DHCP behaviour changed: %d %s", rec.Code, rec.Body)
	}
}

func TestMeshMACsecRouteEnforcementFlushesPlaintextAccess(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)
	forgetRecentDHCP(t, itStaMAC)
	strict := itStrictState()
	withMeshMACsecState(t, strict)

	if err := AddElementToMapComplex("inet", "filter", "ethernet_filter", []string{itStaIP, "eth0", itStaMAC}, "return"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		DeleteElementFromMapComplex("inet", "filter", "ethernet_filter", []string{itStaIP, "eth0", itStaMAC})
	})
	FWmtx.Lock()
	RecentDHCPIface[itStaMAC] = "eth0"
	FWmtx.Unlock()

	snap := GetNFTClient().SnapshotMaps(TableFamilyInet, "filter", getVerdictMapNames())
	station := DeviceEntry{MAC: itStaMAC, RecentIP: itStaIP, PSKEntry: PSKEntry{Type: "sae"}}
	if iface, ok := enforceMeshMACsecRoute(strict, station, "eth0", "eth0", nil, snap); ok || iface != "" {
		t.Fatalf("station routed over the plaintext downlink: %q %v", iface, ok)
	}
	if err := GetMACVerdictElement("inet", "filter", "ethernet_filter", itStaIP, "eth0", itStaMAC, "return"); err == nil {
		t.Error("plaintext anti-spoof entry for the station survived")
	}
	if got := recentDHCPIface(itStaMAC); got != "" {
		t.Errorf("plaintext DHCP interface kept: %q", got)
	}

	if iface, ok := enforceMeshMACsecRoute(strict, station, "macsec0", "", nil, snap); !ok || iface != "macsec0" {
		t.Errorf("station behind the MACsec leaf not routed: %q %v", iface, ok)
	}
	leaf := DeviceEntry{MAC: itLeafMAC, RecentIP: itLeafIP}
	if iface, ok := enforceMeshMACsecRoute(strict, leaf, "eth0", "eth0", nil, snap); !ok || iface != "macsec0" {
		t.Errorf("leaf not pinned to its secY: %q %v", iface, ok)
	}
}

func TestFlushVmapsDropsMeshDownlinkEntriesInStrictMode(t *testing.T) {
	setupFirewallTest(t)
	defer teardownFirewallTest(t)

	if err := os.MkdirAll(filepath.Dir(MESH_SOCKET_PATH), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(MESH_SOCKET_PATH, nil, 0600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.Remove(MESH_SOCKET_PATH) })
	downlink := meshPluginDownlink()
	if downlink == "" {
		t.Skip("no mesh downlink in this environment")
	}

	install := func() {
		if err := AddElementToMapComplex("inet", "filter", "ethernet_filter", []string{itStaIP, downlink, itStaMAC}, "return"); err != nil {
			t.Fatal(err)
		}
	}
	present := func() bool {
		return GetMACVerdictElement("inet", "filter", "ethernet_filter", itStaIP, downlink, itStaMAC, "return") == nil
	}
	t.Cleanup(func() {
		DeleteElementFromMapComplex("inet", "filter", "ethernet_filter", []string{itStaIP, downlink, itStaMAC})
	})

	install()
	withMeshMACsecState(t, MeshMACsecState{})
	flushVmaps(itStaIP, itStaMAC, "wlan0.4096", getVerdictMapNames(), false, false, nil)
	if !present() {
		t.Fatal("without MACsec the existing fast-transition behaviour changed")
	}

	withMeshMACsecState(t, itStrictState())
	flushVmaps(itStaIP, itStaMAC, "wlan0.4096", getVerdictMapNames(), false, false, nil)
	if present() {
		t.Fatal("strict mode kept the station's plaintext anti-spoof entry on the mesh downlink")
	}
}
