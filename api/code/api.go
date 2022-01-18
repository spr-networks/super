/*
	proof of concept for Network API Service
*/
package main

import (
	crand "crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

import (
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"

	"github.com/duo-labs/webauthn/webauthn"
)

var UNIX_WIFID_LISTENER = "/state/wifi/apisock"
var UNIX_DHCPD_LISTENER = "/state/dhcp/apisock"

func showNFMap(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	cmd := exec.Command("nft", "-j", "list", "map", "inet", "filter", name)
	stdout, err := cmd.Output()

	if err != nil {
		fmt.Println(err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, string(stdout))
}

type Client struct {
	Mac     string
	Comment string
}

type ClientZone struct {
	Name    string
	Clients []Client
}

func readZone(dir string, filename string) *ClientZone {
	zone := new(ClientZone)
	zone.Name = filename

	data, err := ioutil.ReadFile(dir + filename)
	if err != nil {
		return zone
	}

	parts := strings.Split(string(data), "\n")
	comment := ""
	mac := ""
	for _, entry := range parts {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		if comment == "" {
			comment = entry
		} else {
			mac = entry
			zone.Clients = append(zone.Clients, Client{mac, comment})
			comment = ""
			mac = ""
		}
	}

	return zone
}

func getStatus(w http.ResponseWriter, r *http.Request) {
	reply := "Online"
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reply)
}

var Zonesmtx sync.Mutex
var ZonesConfigPath = "/configs/zones/zones.json"

func getZones(w http.ResponseWriter, r *http.Request) {
	Zonesmtx.Lock()
	defer Zonesmtx.Unlock()
	zones := getZonesJson()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(zones)
}

type Device struct {
	Mac     string
	PskType string
	Comment string
	Zones   []string
}

func getDevices(w http.ResponseWriter, r *http.Request) {
	Zonesmtx.Lock()
	defer Zonesmtx.Unlock()

	PSKmtx.Lock()
	defer PSKmtx.Unlock()

	zones := getZonesJson()

	psks := getPSKJson()

	devices := map[string]Device{}

	for _, zone := range zones {
		for _, client := range zone.Clients {
			mac := trimLower(client.Mac)
			device, exists := devices[mac]
			if exists {
				device.Zones = append(device.Zones, zone.Name)
				devices[mac] = device
			} else {
				pskType := ""
				pskEntry, exists := psks[mac]
				if exists {
					pskType = pskEntry.Type
				}
				devices[mac] = Device{Mac: mac, Comment: client.Comment, Zones: []string{zone.Name}, PskType: pskType}
			}
		}
	}

	//find devices configured with psks without a zone
	for _, psk := range psks {
		_, exists := devices[psk.Mac]
		if !exists {
			devices[psk.Mac] = Device{Mac: psk.Mac, Comment: "", Zones: []string{}, PskType: psk.Type}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(devices)
}

func saveZones(zones []ClientZone) {
	file, _ := json.MarshalIndent(zones, "", " ")
	err := ioutil.WriteFile(ZonesConfigPath, file, 0644)
	if err != nil {
		log.Fatal(err)
	}
}

func getZonesJson() []ClientZone {
	//re-encode to enforce valid json
	clientZones := []ClientZone{}
	data, err := ioutil.ReadFile(ZonesConfigPath)
	if err != nil {
		return nil
	}
	err = json.Unmarshal(data, &clientZones)
	if err != nil {
		log.Fatal(err)
	}
	return clientZones
}

func getZoneFiles() []ClientZone {
	zones := []ClientZone{}
	files, err := ioutil.ReadDir("/configs/zones")
	if err == nil {
		for _, f := range files {
			name := f.Name()
			if name[0] == '.' {
				continue
			}
			if name == "groups" || name == "zones.json" {
				continue
			}

			zones = append(zones, *readZone("/configs/zones/", f.Name()))
		}
	}

	//tbd rename "groups" to "custom"
	files, err = ioutil.ReadDir("/configs/zones/groups")
	if err == nil {
		for _, f := range files {
			zones = append(zones, *readZone("/configs/zones/groups/", f.Name()))
		}
	}
	return zones
}

func addZoneMember(w http.ResponseWriter, r *http.Request) {
	Zonesmtx.Lock()
	defer Zonesmtx.Unlock()

	name := mux.Vars(r)["name"]

	client := Client{}
	err := json.NewDecoder(r.Body).Decode(&client)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	zones := getZonesJson()
	for z_idx, zone := range zones {
		if zone.Name == name {
			for c_idx, entry := range zone.Clients {
				if equalMAC(entry.Mac, client.Mac) {
					if entry.Comment != client.Comment {
						zone.Clients[c_idx].Comment = client.Comment
						zones[z_idx] = zone
						saveZones(zones)
					}
					return
				}
			}
			//add new entry to zone
			zone.Clients = append(zone.Clients, client)
			zones[z_idx] = zone
			saveZones(zones)
			return
		}
	}
	//make new zone with client
	zones = append(zones, ClientZone{Name: name, Clients: []Client{client}})
	saveZones(zones)
	return
}

func delZoneMember(w http.ResponseWriter, r *http.Request) {
	Zonesmtx.Lock()
	defer Zonesmtx.Unlock()

	name := mux.Vars(r)["name"]

	client := Client{}
	err := json.NewDecoder(r.Body).Decode(&client)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	zones := getZonesJson()
	for z_idx, zone := range zones {
		if zone.Name == name {
			for c_idx, entry := range zone.Clients {
				if equalMAC(entry.Mac, client.Mac) {
					zone.Clients = append(zone.Clients[:c_idx], zone.Clients[c_idx+1:]...)
					zones[z_idx] = zone
					saveZones(zones)
					return
				}
			}
		}
	}

	http.Error(w, "Not found", 404)
	return
}

type DHCPUpdate struct {
	IP     string
	MAC    string
	Name   string
	Iface  string
	Router string
}

func trimLower(a string) string {
	return strings.TrimSpace(strings.ToLower(a))
}

func equalMAC(a string, b string) bool {
	return trimLower(a) == trimLower(b)
}

var (
	builtin_maps  = []string{"internet_access", "dns_access", "lan_access"}
	default_zones = []string{"isolated", "lan", "wan", "dns"}
)

func getVerdictMapNames() []string {
	//get custom maps from zones
	custom_maps := []string{}
	zones := getZonesJson()
	for _, z := range zones {
		skip := false
		for _, y := range default_zones {
			if y == z.Name {
				skip = true
				break
			}
		}
		if skip == false {
			custom_maps = append(custom_maps, z.Name+"_mac_src_access")
			custom_maps = append(custom_maps, z.Name+"_dst_access")
		}
	}
	return append(builtin_maps, custom_maps...)
}

type verdictEntry struct {
	ipv4   string
	ifname string
	mac    string
}

func getNFTVerdictMap(map_name string) []verdictEntry {
	//google/nftables is incomplete and does not support custom set key types

	existing := []verdictEntry{}

	//nft -j list map inet filter name
	cmd := exec.Command("nft", "-j", "list", "map", "inet", "filter", map_name)
	stdout, err := cmd.Output()
	if err != nil {
		fmt.Println(err)
		return existing
	}

	//jq .nftables[1].map.elem[][0].concat
	var data map[string]interface{}
	err = json.Unmarshal(stdout, &data)
	data2, ok := data["nftables"].([]interface{})
	if ok != true {
		log.Fatal("invalid json")
	}
	data3, ok := data2[1].(map[string]interface{})
	data4, ok := data3["map"].(map[string]interface{})
	data5, ok := data4["elem"].([]interface{})
	for _, d := range data5 {
		e, ok := d.([]interface{})
		f, ok := e[0].(map[string]interface{})
		g, ok := f["concat"].([]interface{})
		if ok {
			first, _ := g[0].(string)
			second, second_ok := g[1].(string)
			if len(g) > 2 {
				third, third_ok := g[2].(string)
				if third_ok {
					existing = append(existing, verdictEntry{first, second, third})
				}
			} else {
				if second_ok {
					if map_name == "dhcp_access" {
						// type ifname . ether_addr : verdict (no IP)
						existing = append(existing, verdictEntry{"", first, second})
					} else {
						// for _dst_access
						// type ipv4_addr . ifname : verdict (no MAC)
						existing = append(existing, verdictEntry{first, second, ""})
					}
				}
			}
		}
	}
	return existing
}

func getMapVerdict(name string) string {
	//custom map filtering for destinations is split between two tables.
	// the mac_src_access table is the second half, and _dst_access is the first half
	// The first half uses a continue verdict to transfer into the second verdict map
	if strings.Contains(name, "_dst_access") {
		return "continue"
	}
	return "accept"
}

func flushVmaps(IP string, MAC string, Ifname string, vmap_names []string, matchInterface bool) {
	for _, name := range vmap_names {
		entries := getNFTVerdictMap(name)
		verdict := getMapVerdict(name)
		for _, entry := range entries {
			if (entry.ipv4 == IP) || (matchInterface && (entry.ifname == Ifname)) || (equalMAC(entry.mac, MAC) && (MAC != "")) {
				if entry.mac != "" {
					exec.Command("nft", "delete", "element", "inet", "filter", name, "{", entry.ipv4, ".", entry.ifname, ".", entry.mac, ":", verdict, "}").Run()
				} else {
					exec.Command("nft", "delete", "element", "inet", "filter", name, "{", entry.ipv4, ".", entry.ifname, ":", verdict, "}").Run()
				}
			}
		}
	}
}

func updateArp(Ifname string, IP string, MAC string) {
	exec.Command("arp", "-i", Ifname, "-s", IP, MAC).Run()
}

func updateAddr(Router string, Ifname string) {
	exec.Command("ip", "addr", "add", Router+"/30", "dev", Ifname).Run()
}

func addVerdict(IP string, MAC string, Iface string, Table string) {
	exec.Command("nft", "add", "element", "inet", "filter", Table, "{", IP, ".", Iface, ".", MAC, ":", "accept", "}").Run()
}

func addDNSVerdict(IP string, MAC string, Iface string) {
	addVerdict(IP, MAC, Iface, "dns_access")
}

func addLANVerdict(IP string, MAC string, Iface string) {
	addVerdict(IP, MAC, Iface, "lan_access")
}

func addInternetVerdict(IP string, MAC string, Iface string) {
	addVerdict(IP, MAC, Iface, "internet_access")
}

func addCustomVerdict(ZoneName string, IP string, MAC string, Iface string) {
	//create verdict maps if they do not exist
	err := exec.Command("nft", "list", "map", "inet", "filter", ZoneName+"_dst_access").Run()
	if err != nil {
		//two verdict maps are used for establishing custom groups.
		// the {name}_dst_access map allows Inet packets to a certain IP/interface pair
		//the {name}_mac_src_access part allows Inet packets from a IP/IFace/MAC set

		exec.Command("nft", "add", "map", "inet", "filter", ZoneName+"_mac_src_access", "{", "type", "ipv4_addr", ".", "ifname", ".", "ether_addr", ":", "verdict", ";", "}").Run()
		exec.Command("nft", "add", "map", "inet", "filter", ZoneName+"_dst_access", "{", "type", "ipv4_addr", ".", "ifname", ":", "verdict", ";", "}").Run()
		exec.Command("nft", "insert", "rule", "inet", "filter", "FORWARD", "ip", "daddr", ".", "oifname", "vmap", "@"+ZoneName+"_dst_access", "ip", "saddr", ".", "iifname", ".", "ether", "saddr", "vmap", "@"+ZoneName+"_mac_src_access").Run()
	}

	exec.Command("nft", "add", "element", "inet", "filter", ZoneName+"_dst_access", "{", IP, ".", Iface, ":", "continue", "}").Run()

	exec.Command("nft", "add", "element", "inet", "filter", ZoneName+"_mac_src_access", "{", IP, ".", Iface, ".", MAC, ":", "accept", "}").Run()
}

func populateVmapEntries(IP string, MAC string, Iface string) {
	zones := getZonesJson()
	for _, zone := range zones {
		if zone.Name == "isolated" {
			continue
		}
		for _, entry := range zone.Clients {
			if equalMAC(entry.Mac, MAC) {
				//client belongs to verdict map, add it
				switch zone.Name {
				case "dns":
					addDNSVerdict(IP, MAC, Iface)
				case "lan":
					addLANVerdict(IP, MAC, Iface)
				case "wan":
					addInternetVerdict(IP, MAC, Iface)
				default:
					//custom group
					addCustomVerdict(zone.Name, IP, MAC, Iface)
				}
			}
		}
	}

}

func updateLocalMappings(IP string, Name string) {
	var localMappingsPath = "/state/dns/local_mappings"
	data, err := ioutil.ReadFile(localMappingsPath)
	if err != nil {
		return
	}
	entryName := Name + ".lan"
	new_data := ""
	for _, line := range strings.Split(string(data), "\n") {
		pieces := strings.Split(line, " ")
		if len(pieces) < 2 {
			continue
		}
		ip := pieces[0]
		hostname := pieces[1]
		if ip == IP || entryName == hostname {
			continue
		}
		new_data += ip + " " + hostname + "\n"
	}
	new_data += IP + " " + entryName + "\n"
	ioutil.WriteFile(localMappingsPath, []byte(new_data), 0644)
}

var DHCPmtx sync.Mutex

func dhcpUpdate(w http.ResponseWriter, r *http.Request) {
	DHCPmtx.Lock()
	defer DHCPmtx.Unlock()

	//Handle networking tasks upon a DHCP

	http.Error(w, "Not implemented", 400)

	dhcp := DHCPUpdate{}
	err := json.NewDecoder(r.Body).Decode(&dhcp)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	//1. delete this ip, mac from any existing verdict maps

	//if the interface is vif flush it
	matchInterface := false
	vlansif := os.Getenv("VLANSIF")
	if len(vlansif) > 0 && strings.Contains(dhcp.Iface, vlansif) {
		matchInterface = true
	}

	flushVmaps(dhcp.IP, dhcp.MAC, dhcp.Iface, getVerdictMapNames(), matchInterface)

	//2. update static arp entry
	updateAddr(dhcp.Router, dhcp.Iface)

	updateArp(dhcp.Iface, dhcp.IP, dhcp.MAC)

	//3. add entry to appropriate verdict maps
	populateVmapEntries(dhcp.IP, dhcp.MAC, dhcp.Iface)

	//4. update local mappings file for DNS
	updateLocalMappings(dhcp.IP, dhcp.Name)
}

var PSKConfigPath = "/configs/wifi/psks.json"

type PSKAuthFailure struct {
	Type   string
	MAC    string
	Reason string
	Status string
}

func reportPSKAuthFailure(w http.ResponseWriter, r *http.Request) {
	PSKmtx.Lock()
	defer PSKmtx.Unlock()

	pskf := PSKAuthFailure{}
	err := json.NewDecoder(r.Body).Decode(&pskf)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if pskf.MAC == "" || (pskf.Type != "sae" && pskf.Type != "wpa") || (pskf.Reason != "noentry" && pskf.Reason != "mismatch") {
		http.Error(w, "malformed data", 400)
		return
	}

	psks := getPSKJson()
	pendingPSK, exists := psks["pending"]
	if pskf.Reason == "noentry" && exists {
		auth_type := pskf.Type
		if auth_type == "wpa" {
			auth_type = "wpa2"
		}

		if auth_type != pendingPSK.Type {
			fmt.Println("WARNING: mismatch between pending type and client auth attempt", auth_type, pendingPSK.Type)
		}

		// take the pending PSK and assign it
		psk := PSKEntry{Psk: pendingPSK.Psk, Type: auth_type, Mac: pskf.MAC}
		psks := getPSKJson()
		psks[psk.Mac] = psk
		savePSKs(psks)
		doReloadPSKFiles()

		delete(psks, "pending")

		pskf.Status = "Installed pending PSK"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pskf)
}

type PSKAuthSuccess struct {
	Iface  string
	Event  string
	MAC    string
	Status string
}

func reportPSKAuthSuccess(w http.ResponseWriter, r *http.Request) {
	PSKmtx.Lock()
	defer PSKmtx.Unlock()

	pska := PSKAuthSuccess{}
	err := json.NewDecoder(r.Body).Decode(&pska)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if pska.Iface == "" || pska.Event != "AP-STA-CONNECTED" || pska.MAC == "" {
		http.Error(w, "malformed data", 400)
		return
	}

	pska.Status = "Okay"

	//check if there is a pending psk to assign. if the mac is not known, then it was the pending psk

	psks := getPSKJson()
	pendingPsk, exists := psks["pending"]
	if exists {
		var foundPSK = false
		for k := range psks {
			if k == pska.MAC {
				foundPSK = true
				break
			}
		}
		if !foundPSK {
			//assign MAC to pendingPSK
			pendingPsk.Mac = pska.MAC
			psks[pska.MAC] = pendingPsk
			pska.Status = "Installed Pending PSK"
			delete(psks, "pending")
			savePSKs(psks)
			doReloadPSKFiles()
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pska)
}

type PSKEntry struct {
	Type string
	Mac  string
	Psk  string
}

func loadPSKFiles() map[string]PSKEntry {
	pskEntries := map[string]PSKEntry{}

	data, err := ioutil.ReadFile("/configs/wifi/sae_passwords")
	if err != nil {
		return nil
	}

	parts := strings.Split(string(data), "\n")
	for _, entry := range parts {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		parts := strings.Split(entry, "|")
		psk := parts[0]
		mac := parts[1]
		mac = strings.Split(mac, "=")[1]
		pskEntries[mac] = PSKEntry{"sae", mac, psk}
	}

	data, err = ioutil.ReadFile("/configs/wifi/wpa2pskfile")
	if err != nil {
		return nil
	}

	parts = strings.Split(string(data), "\n")
	for _, entry := range parts {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		parts := strings.Split(entry, " ")
		mac := parts[0]
		psk := parts[1]
		pskEntries[mac] = PSKEntry{"wpa2", mac, psk}
	}

	return pskEntries

}

func getPSKJson() map[string]PSKEntry {
	//re-encode to enforce valid json
	psks := map[string]PSKEntry{}
	data, err := ioutil.ReadFile(PSKConfigPath)
	if err != nil {
		return nil
	}
	json.Unmarshal(data, &psks)
	return psks
}

func savePSKs(psks map[string]PSKEntry) {
	file, _ := json.MarshalIndent(psks, "", " ")
	err := ioutil.WriteFile(PSKConfigPath, file, 0644)
	if err != nil {
		log.Fatal(err)
	}
}

func genSecurePassword() string {
	pw := make([]byte, 16)
	n, err := crand.Read(pw)
	if n != 16 || err != nil {
		log.Fatal(err)
	}
	return base64.RawURLEncoding.EncodeToString(pw)
}

var PSKmtx sync.Mutex

func setPSK(w http.ResponseWriter, r *http.Request) {
	PSKmtx.Lock()
	defer PSKmtx.Unlock()

	psk := PSKEntry{}
	err := json.NewDecoder(r.Body).Decode(&psk)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	psks := getPSKJson()

	if r.Method == http.MethodDelete {
		//delete by MAC
		delete(psks, psk.Mac)
		savePSKs(psks)
		doReloadPSKFiles()
		return
	}

	//Ensure that psk has a Mac and a type
	if psk.Type != "sae" && psk.Type != "wpa2" {
		http.Error(w, "malformed data", 400)
		return
	}

	if len(psk.Psk) > 0 && len(psk.Psk) < 8 {
		http.Error(w, "psk too short", 400)
		return
	}

	pskGenerated := false

	//generate a PSK if one is not provided
	if psk.Psk == "" {
		psk.Psk = genSecurePassword()
		pskGenerated = true
	}

	if psk.Mac == "" {
		//assign a pending PSK for later
		psks["pending"] = psk
	} else {
		psks[psk.Mac] = psk
	}

	savePSKs(psks)
	doReloadPSKFiles()

	if pskGenerated == false {
		psk.Psk = "***"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(psk)

}

func reloadPSKFiles(w http.ResponseWriter, r *http.Request) {
	PSKmtx.Lock()
	defer PSKmtx.Unlock()
	doReloadPSKFiles()
}

func doReloadPSKFiles() {
	//generate PSK files for hostapd
	psks := getPSKJson()

	wpa2 := ""
	sae := ""

	for keyval, entry := range psks {
		if keyval == "pending" {
			//set wildcard password at front. hostapd uses a FILO for the sae keys
			if entry.Type == "sae" {
				sae = entry.Psk + "|mac=ff:ff:ff:ff:ff:ff" + "\n" + sae
			} else if entry.Type == "wpa2" {
				wpa2 = "ff:ff:ff:ff:ff:ff " + entry.Psk + "\n" + wpa2
			}
		} else {
			if entry.Type == "sae" {
				sae += entry.Psk + "|mac=" + entry.Mac + "\n"
			} else if entry.Type == "wpa2" {
				wpa2 += entry.Mac + " " + entry.Psk + "\n"
			}
		}
	}

	err := ioutil.WriteFile("/configs/wifi/sae_passwords", []byte(sae), 0644)
	if err != nil {
		log.Fatal(err)
	}
	err = ioutil.WriteFile("/configs/wifi/wpa2pskfile", []byte(wpa2), 0644)
	if err != nil {
		log.Fatal(err)
	}

	//reload the hostapd passwords
	cmd := exec.Command("hostapd_cli", "-p", "/state/wifi/control", "-s", "/state/wifi/", "reload_wpa_psk")
	err = cmd.Run()
	if err != nil {
		log.Fatal(err)
	}

}

//hostapd API

func RunHostapdAllStations() (map[string]map[string]string, error) {
	m := map[string]map[string]string{}
	out, err := RunHostapdCommand("all_sta")
	if err != nil {
		return nil, err
	}

	mac := ""
	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "=") {
			pair := strings.Split(line, "=")
			if mac != "" {
				m[mac][pair[0]] = pair[1]
			}
		} else if strings.Contains(line, ":") {
			mac = line
			m[mac] = map[string]string{}
		}

	}

	return m, nil
}

func RunHostapdStatus() (map[string]string, error) {
	m := map[string]string{}

	out, err := RunHostapdCommand("status")
	if err != nil {
		return nil, err
	}

	for _, line := range strings.Split(out, "\n") {
		if strings.Contains(line, "=") {
			pair := strings.Split(line, "=")
			m[pair[0]] = pair[1]
		}

	}
	return m, nil
}

func RunHostapdCommand(cmd string) (string, error) {

	outb, err := exec.Command("hostapd_cli", "-p", "/state/wifi/control", "-s", "/state/wifi", cmd).Output()
	if err != nil {
		return "", fmt.Errorf("Failed to execute command %s", cmd)
	}
	return string(outb), nil
}

func hostapdStatus(w http.ResponseWriter, r *http.Request) {
	status, err := RunHostapdStatus()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func hostapdAllStations(w http.ResponseWriter, r *http.Request) {
	stations, err := RunHostapdAllStations()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stations)
}

//set up SPA handler. From gorilla mux's documentation
type spaHandler struct {
	staticPath string
	indexPath  string
}

func (h spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path, err := filepath.Abs(r.URL.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	path = filepath.Join(h.staticPath, path)
	_, err = os.Stat(path)
	if os.IsNotExist(err) {
		http.ServeFile(w, r, filepath.Join(h.staticPath, h.indexPath))
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	http.FileServer(http.Dir(h.staticPath)).ServeHTTP(w, r)
}

func main() {
	unix_dhcpd_router := mux.NewRouter().StrictSlash(true)
	unix_wifid_router := mux.NewRouter().StrictSlash(true)
	external_router_authenticated := mux.NewRouter().StrictSlash(true)
	external_router_public := mux.NewRouter()

	spa := spaHandler{staticPath: "/build", indexPath: "index.html"}
	external_router_public.PathPrefix("/").Handler(spa)

	//nftable helpers
	external_router_authenticated.HandleFunc("/nfmap/{name}", showNFMap).Methods("GET")

	//Misc
	external_router_authenticated.HandleFunc("/status", getStatus).Methods("GET", "OPTIONS")
	// Zone management
	external_router_authenticated.HandleFunc("/zones", getZones).Methods("GET")
	external_router_authenticated.HandleFunc("/zone/{name}", addZoneMember).Methods("PUT")
	external_router_authenticated.HandleFunc("/zone/{name}", delZoneMember).Methods("DELETE")
	external_router_authenticated.HandleFunc("/devices", getDevices).Methods("GET")

	//Assign a PSK
	external_router_authenticated.HandleFunc("/setPSK", setPSK).Methods("PUT", "DELETE")
	//Force reload
	external_router_authenticated.HandleFunc("/reloadPSKFiles", reloadPSKFiles).Methods("PUT")
	//hostadp information
	external_router_authenticated.HandleFunc("/hostapd/status", hostapdStatus).Methods("GET")
	external_router_authenticated.HandleFunc("/hostapd/all_stations", hostapdAllStations).Methods("GET")

	// PSK management for stations
	unix_wifid_router.HandleFunc("/reportPSKAuthFailure", reportPSKAuthFailure).Methods("PUT")
	unix_wifid_router.HandleFunc("/reportPSKAuthSuccess", reportPSKAuthSuccess).Methods("PUT")

	// DHCP actions
	unix_dhcpd_router.HandleFunc("/dhcpUpdate", dhcpUpdate).Methods("PUT")

	os.Remove(UNIX_WIFID_LISTENER)
	unixWifidListener, err := net.Listen("unix", UNIX_WIFID_LISTENER)
	if err != nil {
		panic(err)
	}

	os.Remove(UNIX_DHCPD_LISTENER)
	unixDhcpdListener, err := net.Listen("unix", UNIX_DHCPD_LISTENER)
	if err != nil {
		panic(err)
	}

	wifidServer := http.Server{Handler: unix_wifid_router}
	dhcpdServer := http.Server{Handler: unix_dhcpd_router}

	//temp until API and website are in the same spot
	headersOk := handlers.AllowedHeaders([]string{"X-Requested-With", "Content-Type", "Authorization"})
	originsOk := handlers.AllowedOrigins([]string{"*"})
	methodsOk := handlers.AllowedMethods([]string{"GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"})

	auth := new(authnconfig)
	w, err := webauthn.New(&webauthn.Config{
		RPDisplayName: "SPR",
		RPID:          "localhost",
		RPOrigin:      "http://localhost", // The origin URL for WebAuthn requests
	})

	if err != nil {
		log.Fatal("failed to create WebAuthn from config:", err)
	}
	auth.webAuthn = w

	go http.ListenAndServe("0.0.0.0:80", handlers.CORS(originsOk, headersOk, methodsOk)(auth.Authenticate(external_router_authenticated, external_router_public)))

	go wifidServer.Serve(unixWifidListener)

	dhcpdServer.Serve(unixDhcpdListener)
}
