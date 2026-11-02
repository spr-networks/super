package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

const (
	testLeafMAC     = "02:aa:bb:cc:dd:01"
	testDownLeafMAC = "00:11:22:33:44:66"
	testStationMAC  = "aa:bb:cc:00:00:01"
)

func stubMeshMACsec(t *testing.T) {
	t.Helper()
	oldIsSecY, oldFetch, oldEnabled, oldApply := meshMACsecIsSecY, meshMACsecFetch, meshMACsecPluginEnabled, meshMACsecApplySets
	oldFile, oldState := MeshMACsecStateFile, gMeshMACsec
	t.Cleanup(func() {
		meshMACsecIsSecY, meshMACsecFetch, meshMACsecPluginEnabled, meshMACsecApplySets = oldIsSecY, oldFetch, oldEnabled, oldApply
		MeshMACsecStateFile = oldFile
		MeshMACsecmtx.Lock()
		gMeshMACsec = oldState
		MeshMACsecmtx.Unlock()
	})
	meshMACsecIsSecY = func(name string) bool { return len(name) > 6 && name[:6] == "macsec" }
	meshMACsecPluginEnabled = func() bool { return true }
	meshMACsecApplySets = func(prev, next []string) {}
	MeshMACsecStateFile = filepath.Join(t.TempDir(), "mesh_macsec.json")
	MeshMACsecmtx.Lock()
	gMeshMACsec = MeshMACsecState{}
	MeshMACsecmtx.Unlock()
}

func strictMeshState() MeshMACsecState {
	return MeshMACsecState{
		Role:   "main",
		Strict: true,
		Links: []MeshMACsecLink{
			{LeafIP: "192.168.2.10", Interface: "macsec0", Parent: "eth1", LeafMAC: testLeafMAC, Secured: true},
			{LeafIP: "192.168.2.14", Interface: "", Parent: "eth1", LeafMAC: testDownLeafMAC},
		},
	}
}

var testAPIfaces = []string{"wlan0", "wlan1"}

func TestSanitizeMeshMACsecState(t *testing.T) {
	stubMeshMACsec(t)
	if got := sanitizeMeshMACsecState(MeshMACsecState{Role: "leaf", Strict: true, Links: []MeshMACsecLink{{Interface: "macsec0", LeafMAC: testLeafMAC}}}); got.Role != "" || got.Strict || len(got.Links) != 0 {
		t.Fatalf("non-main role kept: %+v", got)
	}
	raw := MeshMACsecState{Role: "main", Strict: true, Links: []MeshMACsecLink{
		{LeafIP: "192.168.2.10", Interface: "macsec0", Parent: "eth1", LeafMAC: "00:11:22:33:44:AA", Mode: "wireguard", Secured: true},
		{LeafIP: "192.168.2.11", Interface: "eth1", Parent: "eth2", LeafMAC: "00:11:22:33:44:bb", Mode: "wireguard; x", Secured: true},
		{LeafIP: "192.168.2.12", Interface: "macsec1;reboot", Parent: "eth1", LeafMAC: "00:11:22:33:44:cc", Secured: true},
		{LeafIP: "192.168.2.13", Interface: "macsec0", Parent: "eth1", LeafMAC: "00:11:22:33:44:dd", Secured: true},
		{LeafIP: "not-an-ip", Interface: "macsec2", Parent: "eth1;x", LeafMAC: "bogus", Secured: true},
		{LeafIP: "192.168.2.20", Pending: true},
	}}
	got := sanitizeMeshMACsecState(raw)
	if !got.Strict || len(got.Links) != 5 {
		t.Fatalf("got %+v", got)
	}
	want := []MeshMACsecLink{
		{LeafIP: "192.168.2.10", Interface: "macsec0", Parent: "eth1", LeafMAC: "00:11:22:33:44:aa", Mode: "wireguard", Secured: true},
		{LeafIP: "192.168.2.11", Interface: "", Parent: "eth2", LeafMAC: "00:11:22:33:44:bb"},
		{LeafIP: "192.168.2.12", Interface: "", Parent: "eth1", LeafMAC: "00:11:22:33:44:cc"},
		{LeafIP: "192.168.2.13", Interface: "", Parent: "eth1", LeafMAC: "00:11:22:33:44:dd"},
		{LeafIP: "", Interface: "macsec2", Parent: "", LeafMAC: "", Secured: true},
	}
	for i := range want {
		if got.Links[i] != want[i] {
			t.Errorf("link %d: got %+v want %+v", i, got.Links[i], want[i])
		}
	}
	if ifaces := got.linkIfaces(); len(ifaces) != 2 || ifaces[0] != "macsec0" || ifaces[1] != "macsec2" {
		t.Errorf("link interfaces %v", ifaces)
	}
}

func TestMeshMACsecCheckDHCP(t *testing.T) {
	strict := strictMeshState()
	mixed := strictMeshState()
	mixed.Strict = false
	cases := []struct {
		name     string
		state    MeshMACsecState
		mac      string
		recentIP string
		iface    string
		wifi     bool
		want     error
	}{
		{"leaf on its secY", strict, testLeafMAC, "192.168.2.10", "macsec0", false, nil},
		{"spoofed leaf MAC on raw downlink", strict, testLeafMAC, "", "eth1", false, errMeshMACsecPinned},
		{"spoofed leaf MAC, uppercase", strict, "02:AA:BB:CC:DD:01", "", "eth2", false, errMeshMACsecPinned},
		{"spoofed leaf MAC, dashes", strict, "02-aa-bb-cc-dd-01", "", "eth1", false, errMeshMACsecPinned},
		{"spoofed leaf MAC on wired VLAN", strict, testLeafMAC, "", "eth1.100", false, errMeshMACsecPinned},
		{"spoofed leaf MAC on main Wi-Fi", strict, testLeafMAC, "", "wlan0.4096", false, errMeshMACsecPinned},
		{"spoofed leaf MAC, mixed mode", mixed, testLeafMAC, "", "eth1", false, errMeshMACsecPinned},
		{"leaf's new MAC holding the leaf IP on raw downlink", strict, "02:aa:bb:cc:dd:99", "192.168.2.10", "eth1", false, errMeshMACsecPinned},
		{"leaf's new MAC holding the leaf IP on its secY", strict, "02:aa:bb:cc:dd:99", "192.168.2.10", "macsec0", false, nil},
		{"leaf with secY down, raw downlink", strict, testDownLeafMAC, "", "eth1", false, errMeshMACsecPinned},
		{"leaf with secY down, other leaf's secY", strict, testDownLeafMAC, "", "macsec0", false, errMeshMACsecPinned},
		{"pending leaf on raw downlink", strict, "02:aa:bb:cc:dd:77", "192.168.2.20", "eth1", false, nil},
		{"spoofed station on raw downlink", strict, testStationMAC, "", "eth1", true, errMeshMACsecPlaintext},
		{"spoofed station on wired VLAN", strict, testStationMAC, "", "eth2.7", true, errMeshMACsecPlaintext},
		{"spoofed station on dotted downlink", strict, testStationMAC, "", "eth3.100", true, errMeshMACsecPlaintext},
		{"spoofed station on disabled downlink", strict, testStationMAC, "", "eth4", true, errMeshMACsecPlaintext},
		{"spoofed station on lookalike AP name", strict, testStationMAC, "", "wlan0x", true, errMeshMACsecPlaintext},
		{"station behind MACsec leaf", strict, testStationMAC, "", "macsec0", true, nil},
		{"station on main AP/VLAN", strict, testStationMAC, "", "wlan0.4096", true, nil},
		{"station on main guest AP/VLAN", strict, testStationMAC, "", "wlan1.ap0.4097", true, nil},
		{"station over wireguard", strict, testStationMAC, "", "wg0", true, nil},
		{"wired device on raw downlink", strict, "aa:bb:cc:00:00:02", "", "eth1", false, nil},
		{"wired device on VLAN", strict, "aa:bb:cc:00:00:02", "", "eth1.100", false, nil},
		{"station on raw downlink, mixed mode", mixed, testStationMAC, "", "eth1", true, nil},
		{"no MACsec configured", MeshMACsecState{}, testLeafMAC, "", "eth1", true, nil},
	}
	for _, c := range cases {
		if got := meshMACsecCheckDHCP(c.state, c.mac, c.recentIP, c.iface, c.wifi, testAPIfaces); !errors.Is(got, c.want) {
			t.Errorf("%s: got %v want %v", c.name, got, c.want)
		}
	}
}

func TestMeshMACsecErrorsNameTheLink(t *testing.T) {
	wg := strictMeshState()
	for i := range wg.Links {
		wg.Links[i].Mode = "wireguard"
	}
	mixed := strictMeshState()
	mixed.Links[0].Mode = "wireguard"
	mixed.Links[1].Mode = "macsec"
	cases := []struct {
		state MeshMACsecState
		mac   string
		wifi  bool
		want  string
	}{
		{strictMeshState(), testLeafMAC, false, "Mesh node detected on non Encrypted Link (MACsec)"},
		{wg, testLeafMAC, false, "Mesh node detected on non Encrypted Link (WireGuard)"},
		{strictMeshState(), testStationMAC, true, "Encrypted Link (MACsec) is enforced, reject plaintext ethernet"},
		{wg, testStationMAC, true, "Encrypted Link (WireGuard) is enforced, reject plaintext ethernet"},
		{mixed, testStationMAC, true, "Encrypted Link is enforced, reject plaintext ethernet"},
	}
	for _, c := range cases {
		if got := meshMACsecCheckDHCP(c.state, c.mac, "", "eth1", c.wifi, testAPIfaces); got == nil || got.Error() != c.want {
			t.Errorf("got %v want %q", got, c.want)
		}
	}
}

func TestMeshMACsecRouteIface(t *testing.T) {
	strict := strictMeshState()
	mixed := strictMeshState()
	mixed.Strict = false
	cases := []struct {
		name      string
		state     MeshMACsecState
		mac       string
		ip        string
		candidate string
		wifi      bool
		wantIface string
		wantOK    bool
	}{
		{"leaf pinned from lanif fallback", strict, testLeafMAC, "", "eth1", false, "macsec0", true},
		{"leaf pinned with no suggestion", strict, testLeafMAC, "", "", false, "macsec0", true},
		{"leaf pinned in mixed mode", mixed, testLeafMAC, "", "eth1", false, "macsec0", true},
		{"leaf pinned by IP after a MAC change", strict, "02:aa:bb:cc:dd:99", "192.168.2.10", "eth1", false, "macsec0", true},
		{"leaf with secY down not routed", strict, testDownLeafMAC, "", "eth1", false, "", false},
		{"station via meshDownlink fallback", strict, testStationMAC, "", "eth1", true, "", false},
		{"station via wired VLAN", strict, testStationMAC, "", "eth1.4", true, "", false},
		{"station via dotted downlink", strict, testStationMAC, "", "eth3.100", true, "", false},
		{"station with no interface", strict, testStationMAC, "", "", true, "", false},
		{"station behind MACsec leaf", strict, testStationMAC, "", "macsec0", true, "macsec0", true},
		{"station on main AP/VLAN", strict, testStationMAC, "", "wlan0.4096", true, "wlan0.4096", true},
		{"station over wireguard", strict, testStationMAC, "", "wg0", true, "wg0", true},
		{"wired device on raw downlink", strict, "aa:bb:cc:00:00:02", "", "eth1", false, "eth1", true},
		{"station mixed mode", mixed, testStationMAC, "", "eth1", true, "eth1", true},
		{"no MACsec configured", MeshMACsecState{}, testStationMAC, "", "eth1", true, "eth1", true},
	}
	for _, c := range cases {
		iface, ok := meshMACsecRouteIface(c.state, c.mac, c.ip, c.candidate, c.wifi, testAPIfaces)
		if iface != c.wantIface || ok != c.wantOK {
			t.Errorf("%s: got (%q, %v) want (%q, %v)", c.name, iface, ok, c.wantIface, c.wantOK)
		}
	}
}

func TestMeshMACsecWifiDevice(t *testing.T) {
	if !meshMACsecWifiDevice(DeviceEntry{PSKEntry: PSKEntry{Type: "sae"}}) {
		t.Error("PSK station not treated as Wi-Fi")
	}
	if !meshMACsecWifiDevice(DeviceEntry{Policies: []string{"wan", "dns", "noapi", "guestonly"}}) {
		t.Error("mesh guest station not treated as Wi-Fi")
	}
	if meshMACsecWifiDevice(DeviceEntry{Policies: []string{"wan", "dns"}}) {
		t.Error("wired device treated as Wi-Fi")
	}
}

func TestMeshMACsecAPInterfaces(t *testing.T) {
	got := meshMACsecAPInterfaces([]InterfaceConfig{
		{Name: "wlan0", Type: "AP", Enabled: true},
		{Name: "wlan1", Type: "AP", Enabled: false},
		{Name: "eth1", Type: "Downlink", Enabled: true},
	})
	if len(got) != 1 || got[0] != "wlan0" {
		t.Fatalf("%v", got)
	}
}

func TestMeshKeepDownlinkEntry(t *testing.T) {
	if !meshKeepDownlinkEntry(true, false, false, "ethernet_filter", "eth1", "eth1") {
		t.Error("existing fast-transition behaviour changed")
	}
	if meshKeepDownlinkEntry(true, true, false, "ethernet_filter", "eth1", "eth1") {
		t.Error("strict mode keeps stale plaintext anti-spoof entries")
	}
	if meshKeepDownlinkEntry(true, false, true, "ethernet_filter", "eth1", "eth1") {
		t.Error("disabled device entries kept")
	}
	if meshKeepDownlinkEntry(true, false, false, "fwd_iface_lan", "eth1", "eth1") {
		t.Error("non ethernet_filter entries kept")
	}
}

func TestRemapMeshMACsecIfaces(t *testing.T) {
	prev := MeshMACsecState{Role: "main", Links: []MeshMACsecLink{
		{LeafIP: "192.168.2.10", Interface: "macsec0"},
		{LeafIP: "192.168.2.14", Interface: "macsec1"},
	}}
	next := MeshMACsecState{Role: "main", Links: []MeshMACsecLink{
		{LeafIP: "192.168.2.14", Interface: "macsec0"},
		{LeafIP: "192.168.2.18", Interface: "macsec1"},
	}}
	recent := map[string]string{
		"aa:00:00:00:00:01": "macsec0",
		"aa:00:00:00:00:02": "macsec1",
		"aa:00:00:00:00:03": "eth1",
		"aa:00:00:00:00:04": "wlan0.4096",
	}
	remapMeshMACsecIfaces(prev, next, recent)
	if _, ok := recent["aa:00:00:00:00:01"]; ok {
		t.Errorf("station of a removed leaf kept a secY now owned by another leaf: %v", recent)
	}
	if recent["aa:00:00:00:00:02"] != "macsec0" {
		t.Errorf("station not moved with its leaf's secY: %v", recent)
	}
	if recent["aa:00:00:00:00:03"] != "eth1" || recent["aa:00:00:00:00:04"] != "wlan0.4096" {
		t.Errorf("non-MACsec entries changed: %v", recent)
	}
}

func TestMeshMACsecStateSurvivesPluginOutageAndRestart(t *testing.T) {
	stubMeshMACsec(t)
	meshMACsecFetch = func() (MeshMACsecState, error) { return strictMeshState(), nil }
	meshMACsecPollOnce()
	if !meshMACsecSnapshot().Strict {
		t.Fatal("state not loaded")
	}

	meshMACsecFetch = func() (MeshMACsecState, error) { return MeshMACsecState{}, errors.New("connection refused") }
	meshMACsecPollOnce()
	if s := meshMACsecSnapshot(); !s.Strict || len(s.Links) != 2 {
		t.Fatalf("enforcement dropped while the plugin was unreachable: %+v", s)
	}

	st, err := os.Stat(MeshMACsecStateFile)
	if err != nil || st.Mode().Perm() != 0600 {
		t.Fatalf("state not persisted privately: %v %v", err, st)
	}
	MeshMACsecmtx.Lock()
	gMeshMACsec = MeshMACsecState{}
	MeshMACsecmtx.Unlock()
	loadMeshMACsecState()
	if err := meshMACsecCheckDHCP(meshMACsecSnapshot(), testLeafMAC, "", "eth1", false, testAPIfaces); err == nil {
		t.Fatal("pin lost across an API restart")
	}

	meshMACsecPluginEnabled = func() bool { return false }
	meshMACsecPollOnce()
	if s := meshMACsecSnapshot(); s.Role != "" || len(s.Links) != 0 {
		t.Fatalf("state kept after disabling the plugin: %+v", s)
	}
}

func TestMeshMACsecInterfaceSetUpdates(t *testing.T) {
	stubMeshMACsec(t)
	var calls [][2][]string
	meshMACsecApplySets = func(prev, next []string) { calls = append(calls, [2][]string{prev, next}) }
	updateMeshMACsecState(sanitizeMeshMACsecState(strictMeshState()))
	updateMeshMACsecState(sanitizeMeshMACsecState(strictMeshState()))
	if len(calls) != 1 {
		t.Fatalf("unchanged state re-applied interface sets: %d", len(calls))
	}
	if len(calls[0][1]) != 1 || calls[0][1][0] != "macsec0" {
		t.Fatalf("sets %v", calls[0])
	}
	updateMeshMACsecState(MeshMACsecState{})
	if len(calls) != 2 || len(calls[1][0]) != 1 || len(calls[1][1]) != 0 {
		t.Fatalf("removal not applied: %v", calls)
	}
}

func bridgeMeshState() MeshMACsecState {
	return MeshMACsecState{
		Role: "main",
		Links: []MeshMACsecLink{
			{LeafIP: "192.168.2.10", Interface: meshLinkBridge, Parent: "eth1", LeafMAC: testLeafMAC, Mode: "wireguard", Secured: true},
			{LeafIP: "192.168.2.14", Interface: meshLinkBridge, Parent: "eth1", LeafMAC: testDownLeafMAC, Mode: "macsec", Secured: true},
			{LeafIP: "192.168.2.18", Interface: meshLinkBridge, Parent: "eth1"},
		},
	}
}

func swapRecentDHCPIface(t *testing.T, recent map[string]string) {
	FWmtx.Lock()
	old := RecentDHCPIface
	RecentDHCPIface = recent
	FWmtx.Unlock()
	t.Cleanup(func() {
		FWmtx.Lock()
		RecentDHCPIface = old
		FWmtx.Unlock()
	})
}

func TestMeshWifiFallbackIface(t *testing.T) {
	for recent, want := range map[string]string{meshLinkBridge: meshLinkBridge, "macsec0": "eth1", "eth1": "eth1", "": "eth1"} {
		if got := meshWifiFallbackIface(bridgeMeshState(), recent, "eth1"); got != want {
			t.Errorf("station last seen on %q routed via %q, want %q", recent, got, want)
		}
	}
	if got := meshWifiFallbackIface(strictMeshState(), "macsec0", "eth1"); got != "macsec0" {
		t.Errorf("station behind a MACsec node routed via %q", got)
	}
}

func TestSecuredLinkKey(t *testing.T) {
	a, b := bridgeMeshState(), bridgeMeshState()
	b.Links[0], b.Links[1] = b.Links[1], b.Links[0]
	if a.securedLinkKey() != "192.168.2.10=mshbr0,192.168.2.14=mshbr0" || a.securedLinkKey() != b.securedLinkKey() {
		t.Fatalf("keys %q %q", a.securedLinkKey(), b.securedLinkKey())
	}
	b.Links[2].Secured = true
	if a.securedLinkKey() == b.securedLinkKey() || (MeshMACsecState{}).securedLinkKey() != "" {
		t.Error("key did not follow the secured links")
	}
}

func TestRefreshMeshLinkStations(t *testing.T) {
	oldFetch := meshLeafStationsFetch
	t.Cleanup(func() { meshLeafStationsFetch = oldFetch })
	recent := map[string]string{"aa:bb:cc:00:00:01": "eth1", "aa:bb:cc:00:00:09": "wlan0.4096"}
	swapRecentDHCPIface(t, recent)

	meshLeafStationsFetch = func() (map[string]LeafStations, error) { return nil, errors.New("meshd down") }
	if refreshMeshLinkStations(bridgeMeshState()) || recent["aa:bb:cc:00:00:01"] != "eth1" {
		t.Fatal("failed fetch reported success or changed a route")
	}
	leaves := map[string]LeafStations{
		"192.168.2.10": {Stations: map[string]StationInfo{"AA:BB:CC:00:00:01": {"flags": "[AUTH][ASSOC][AUTHORIZED]"}, "aa:bb:cc:00:00:02": {"flags": "[AUTH]"}}},
		"192.168.2.14": {Error: "unreachable"},
		"192.168.2.18": {Stations: map[string]StationInfo{"aa:bb:cc:00:00:03": {"flags": "[AUTHORIZED]"}}},
	}
	meshLeafStationsFetch = func() (map[string]LeafStations, error) { return leaves, nil }
	if refreshMeshLinkStations(bridgeMeshState()) {
		t.Error("an unreachable secured node counted as complete")
	}
	if recent["aa:bb:cc:00:00:01"] != meshLinkBridge || recent["aa:bb:cc:00:00:09"] != "wlan0.4096" || len(recent) != 2 {
		t.Errorf("only the authorized station on a secured node should move: %v", recent)
	}
	leaves["192.168.2.14"] = LeafStations{}
	if !refreshMeshLinkStations(bridgeMeshState()) {
		t.Error("refresh incomplete with every secured node answering")
	}
}

func TestSanitizeKeepsLinksSharingTheBridge(t *testing.T) {
	stubMeshMACsec(t)
	meshMACsecIsSecY = func(name string) bool { return name == meshLinkBridge || name == "macsec0" }
	raw := bridgeMeshState()
	raw.Links = append(raw.Links[:2],
		MeshMACsecLink{LeafIP: "192.168.2.22", Interface: "macsec0", Parent: "eth1", Secured: true},
		MeshMACsecLink{LeafIP: "192.168.2.26", Interface: "macsec0", Parent: "eth1", Secured: true})
	out := sanitizeMeshMACsecState(raw).Links
	if out[0].Interface != meshLinkBridge || out[1].Interface != meshLinkBridge || !out[1].Secured {
		t.Errorf("second node on the bridge lost its link: %+v", out)
	}
	if out[2].Interface != "macsec0" || out[3].Interface != "" || out[3].Secured {
		t.Errorf("a secY claimed by two nodes was accepted twice: %+v", out)
	}
}

func TestRemapKeepsBridgeClientsWhileANodeRemains(t *testing.T) {
	prev := bridgeMeshState()
	prev.Links = prev.Links[:2]
	for _, keep := range []int{0, 1} {
		next := MeshMACsecState{Role: "main", Links: prev.Links[keep : keep+1]}
		recent := map[string]string{"aa:00:00:00:00:01": meshLinkBridge, "aa:00:00:00:00:02": "eth1"}
		remapMeshMACsecIfaces(prev, next, recent)
		if recent["aa:00:00:00:00:01"] != meshLinkBridge || recent["aa:00:00:00:00:02"] != "eth1" {
			t.Fatalf("bridge clients dropped while %s is still on the bridge: %v", next.Links[0].LeafIP, recent)
		}
	}
	recent := map[string]string{"aa:00:00:00:00:01": meshLinkBridge}
	remapMeshMACsecIfaces(prev, MeshMACsecState{Role: "main"}, recent)
	if len(recent) != 0 {
		t.Fatalf("bridge client kept after the last node left: %v", recent)
	}
}

func TestNoteMeshStationConnect(t *testing.T) {
	stubMeshMACsec(t)
	MeshMACsecmtx.Lock()
	gMeshMACsec = bridgeMeshState()
	MeshMACsecmtx.Unlock()
	const sta = "aa:bb:cc:00:00:01"
	for _, c := range []struct {
		name, before, router, remote, want string
	}{
		{"joins an encrypted node", "eth1", "192.168.2.10", "192.168.2.10:5000", meshLinkBridge},
		{"claim from another source", "eth1", "192.168.2.10", "192.168.2.99:5000", "eth1"},
		{"joins a node with no secured link", meshLinkBridge, "192.168.2.18", "192.168.2.18:5000", ""},
		{"joins the main router's AP", meshLinkBridge, "", "@", ""},
		{"main router AP keeps its VLAN", "wlan0.4096", "", "@", "wlan0.4096"},
	} {
		recent := map[string]string{sta: c.before}
		swapRecentDHCPIface(t, recent)
		noteMeshStationConnect("AA:BB:CC:00:00:01", c.router, c.remote)
		if recent[sta] != c.want {
			t.Errorf("%s: %q, want %q", c.name, recent[sta], c.want)
		}
	}
}
