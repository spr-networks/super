package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"reflect"
	"slices"
	"strings"
	"sync"
	"time"
)

type MeshMACsecLink struct {
	LeafIP    string
	Interface string
	Parent    string
	LeafMAC   string
	Secured   bool
	Pending   bool `json:",omitempty"`
}

type MeshMACsecState struct {
	Role   string
	Strict bool
	Links  []MeshMACsecLink
}

var MeshMACsecmtx sync.RWMutex
var gMeshMACsec MeshMACsecState
var MeshMACsecStateFile = TEST_PREFIX + "/state/api/mesh_macsec.json"

var meshMACsecIsSecY = isMACsecInterface
var meshMACsecFetch = fetchMeshMACsecStatus
var meshMACsecPluginEnabled = func() bool { return PluginEnabled("MESH") }
var meshMACsecApplySets = applyMeshMACsecInterfaceSets

func normalizeMeshMAC(mac string) (string, bool) {
	hw, err := net.ParseMAC(mac)
	if err != nil || len(hw) != 6 {
		return "", false
	}
	return hw.String(), true
}

func sanitizeMeshMACsecState(raw MeshMACsecState) MeshMACsecState {
	if raw.Role != "main" {
		return MeshMACsecState{}
	}
	out := MeshMACsecState{Role: "main", Strict: raw.Strict, Links: []MeshMACsecLink{}}
	seenIface := map[string]bool{}
	for _, link := range raw.Links {
		if link.Pending {
			continue
		}
		clean := MeshMACsecLink{Secured: link.Secured}
		if ip := net.ParseIP(link.LeafIP); ip != nil {
			clean.LeafIP = ip.String()
		}
		if isValidIface(link.Parent) && len(link.Parent) < 16 {
			clean.Parent = link.Parent
		}
		if link.Interface != "" && isValidIface(link.Interface) && len(link.Interface) < 16 &&
			link.Interface != link.Parent && !seenIface[link.Interface] && meshMACsecIsSecY(link.Interface) {
			clean.Interface = link.Interface
			seenIface[link.Interface] = true
		}
		if mac, ok := normalizeMeshMAC(link.LeafMAC); ok {
			clean.LeafMAC = mac
		}
		if !clean.Secured || clean.Interface == "" {
			clean.Secured = false
		}
		out.Links = append(out.Links, clean)
	}
	return out
}

func (s MeshMACsecState) linkIfaces() []string {
	ifaces := []string{}
	for _, link := range s.Links {
		if link.Interface != "" {
			ifaces = append(ifaces, link.Interface)
		}
	}
	return ifaces
}

func (s MeshMACsecState) isLinkIface(iface string) bool {
	if iface == "" {
		return false
	}
	for _, link := range s.Links {
		if link.Interface == iface {
			return true
		}
	}
	return false
}

func (s MeshMACsecState) pinnedIface(mac string, ip string) (iface string, pinned bool) {
	if mac, ok := normalizeMeshMAC(mac); ok {
		for _, link := range s.Links {
			if link.LeafMAC == mac {
				return link.Interface, true
			}
		}
	}
	if addr := net.ParseIP(ip); addr != nil {
		for _, link := range s.Links {
			if link.LeafIP != "" && link.LeafIP == addr.String() {
				return link.Interface, true
			}
		}
	}
	return "", false
}

func meshMACsecAPInterfaces(interfaces []InterfaceConfig) []string {
	aps := []string{}
	for _, iface := range interfaces {
		if iface.Type == "AP" && iface.Enabled && iface.Name != "" {
			aps = append(aps, iface.Name)
		}
	}
	return aps
}

func meshMACsecWifiDevice(entry DeviceEntry) bool {
	return isWifiDevice(entry) || slices.Contains(entry.Policies, "guestonly")
}

func meshMACsecWifiAllowed(s MeshMACsecState, iface string, apIfaces []string) bool {
	if iface == "" {
		return false
	}
	if s.isLinkIface(iface) || strings.HasPrefix(iface, "wg") {
		return true
	}
	for _, ap := range apIfaces {
		if iface == ap || strings.HasPrefix(iface, ap+".") {
			return true
		}
	}
	return false
}

var errMeshMACsecPinned = errors.New("device is pinned to a MACsec mesh link, refusing it on another interface")
var errMeshMACsecPlaintext = errors.New("Wi-Fi stations may not use plaintext wired links while mesh MACsec is enforced")

func meshMACsecCheckDHCP(s MeshMACsecState, mac string, recentIP string, iface string, wifi bool, apIfaces []string) error {
	if s.Role != "main" {
		return nil
	}
	if pinned, ok := s.pinnedIface(mac, recentIP); ok {
		if pinned == "" || pinned != iface {
			return errMeshMACsecPinned
		}
		return nil
	}
	if s.Strict && wifi && !meshMACsecWifiAllowed(s, iface, apIfaces) {
		return errMeshMACsecPlaintext
	}
	return nil
}

func meshMACsecRouteIface(s MeshMACsecState, mac string, ip string, candidate string, wifi bool, apIfaces []string) (string, bool) {
	if s.Role != "main" {
		return candidate, true
	}
	if pinned, ok := s.pinnedIface(mac, ip); ok {
		return pinned, pinned != ""
	}
	if s.Strict && wifi && !meshMACsecWifiAllowed(s, candidate, apIfaces) {
		return "", false
	}
	return candidate, true
}

func meshKeepDownlinkEntry(isMesh bool, strict bool, disabled bool, vmapName string, entryIface string, meshDownlink string) bool {
	return isMesh && !strict && !disabled && vmapName == "ethernet_filter" && entryIface == meshDownlink
}

func remapMeshMACsecIfaces(prev MeshMACsecState, next MeshMACsecState, recent map[string]string) {
	prevLeaf := map[string]string{}
	for _, link := range prev.Links {
		if link.Interface != "" && link.LeafIP != "" {
			prevLeaf[link.Interface] = link.LeafIP
		}
	}
	nextIface := map[string]string{}
	for _, link := range next.Links {
		if link.LeafIP != "" {
			nextIface[link.LeafIP] = link.Interface
		}
	}
	for mac, iface := range recent {
		leaf, ok := prevLeaf[iface]
		if !ok || nextIface[leaf] == iface {
			continue
		}
		if moved := nextIface[leaf]; moved != "" {
			recent[mac] = moved
		} else {
			delete(recent, mac)
		}
	}
}

func meshMACsecSnapshot() MeshMACsecState {
	MeshMACsecmtx.RLock()
	defer MeshMACsecmtx.RUnlock()
	s := gMeshMACsec
	s.Links = append([]MeshMACsecLink{}, gMeshMACsec.Links...)
	return s
}

func fetchMeshMACsecStatus() (MeshMACsecState, error) {
	state := MeshMACsecState{}
	req, err := http.NewRequest(http.MethodGet, "http://localhost/macsec/status", nil)
	if err != nil {
		return state, err
	}
	c := getMeshdClient()
	c.Timeout = 5 * time.Second
	defer c.CloseIdleConnections()
	resp, err := c.Do(req)
	if err != nil {
		return state, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return state, nil
	}
	if resp.StatusCode != http.StatusOK {
		return state, fmt.Errorf("meshd macsec status %d", resp.StatusCode)
	}
	err = json.NewDecoder(resp.Body).Decode(&state)
	return state, err
}

func loadMeshMACsecState() {
	data, err := os.ReadFile(MeshMACsecStateFile)
	if err != nil {
		return
	}
	state := MeshMACsecState{}
	if json.Unmarshal(data, &state) != nil {
		return
	}
	updateMeshMACsecState(sanitizeMeshMACsecState(state))
}

func updateMeshMACsecState(next MeshMACsecState) {
	MeshMACsecmtx.Lock()
	prev := gMeshMACsec
	if reflect.DeepEqual(prev, next) {
		MeshMACsecmtx.Unlock()
		return
	}
	gMeshMACsec = next
	if data, err := json.Marshal(next); err == nil {
		if err := os.WriteFile(MeshMACsecStateFile, data, 0600); err != nil {
			log.Println("mesh macsec: failed to persist state", err)
		}
	}
	MeshMACsecmtx.Unlock()

	if prev.Strict != next.Strict || len(prev.Links) != len(next.Links) {
		log.Printf("mesh macsec: %d links, strict=%v\n", len(next.Links), next.Strict)
	}
	FWmtx.Lock()
	remapMeshMACsecIfaces(prev, next, RecentDHCPIface)
	FWmtx.Unlock()
	meshMACsecApplySets(prev.linkIfaces(), next.linkIfaces())
}

func applyMeshMACsecInterfaceSets(prev, next []string) {
	configured := getDownlinkInterfaces()
	for _, iface := range next {
		if !slices.Contains(prev, iface) {
			addWiredLanInterface(iface)
			addLanInterface(iface)
		}
	}
	for _, iface := range prev {
		if !slices.Contains(next, iface) && !slices.Contains(configured, iface) {
			DeleteInterfaceFromSet("wired_lan_interfaces", iface)
			deleteLanInterface(iface)
		}
	}
}

func meshMACsecPoller() {
	loadMeshMACsecState()
	for {
		meshMACsecPollOnce()
		time.Sleep(5 * time.Second)
	}
}

func meshMACsecPollOnce() {
	if isLeafRouter() || !meshMACsecPluginEnabled() {
		updateMeshMACsecState(MeshMACsecState{})
		return
	}
	raw, err := meshMACsecFetch()
	if err != nil {
		return
	}
	updateMeshMACsecState(sanitizeMeshMACsecState(raw))
}
