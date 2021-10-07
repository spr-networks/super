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
	"net/http"
	"os/exec"
	"strings"
	"sync"
)

import (
	"github.com/gorilla/mux"
)

func showMap(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	cmd := exec.Command("nft", "-j", "list", "map", "inet", "filter", name)
	stdout, err := cmd.Output()

	if err != nil {
		fmt.Println("bye")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, string(stdout))
}

func updateMapElement(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	fmt.Println(name)

}

func deleteMapElement(w http.ResponseWriter, r *http.Request) {

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

func getZones(w http.ResponseWriter, r *http.Request) {
  Zonesmtx.Lock()
  defer Zonesmtx.Unlock()
	zones := getZonesJson()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(zones)
}

var Zonesmtx sync.Mutex

var ZonesConfigPath = "/configs/zones/zones.json"

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
	json.Unmarshal(data, &clientZones)
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
				if entry.Mac == client.Mac {
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
				if entry.Mac == client.Mac {
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

func getVerdictMapNames() []string {
	builtin_maps := []string{"dhcp_access", "internet_access", "dns_access", "lan_access"}
	default_zones := []string{"isolated", "lan_only", "wan_lan", "wan_lan_admin", "wan_only"}
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

func flushVmaps(IP string, MAC string, vmap_names []string) {

}

func updateArp(IP string, MAC string) {
}

func updateRoute(IP string, Iface string) {
}

func populateVmapEntries(IP string, MAC string, Iface string) {
	//4. create verdict map for custom group if necessary
}

func updateLocalMappings(IP string, Name string) {

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
	//DHCP -> IP, MAC, NAME, IFACE, ROUTER

	//1. delete this ip, mac from any existing verdict maps
	flushVmaps(dhcp.IP, dhcp.MAC, getVerdictMapNames())

	//2. update static arp entry
	updateArp(dhcp.IP, dhcp.MAC)
	updateRoute(dhcp.IP, dhcp.Iface)

	//3. add entry to appropriate verdict maps
	populateVmapEntries(dhcp.IP, dhcp.MAC, dhcp.Iface)

	//4. update local mappings file for DNS
	updateLocalMappings(dhcp.IP, dhcp.Name)
}

var PSKConfigPath = "/configs/wifi/psks.json"

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
		parts := strings.Split(strings.SplitN(entry, "=", 2)[1], "|")
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
		return
	}

	//otherwise, creating an entry. ensure that psk has a Mac and a type
	if psk.Mac == "" || (psk.Type != "sae" && psk.Type != "wpa2") {
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

	psks[psk.Mac] = psk
	savePSKs(psks)

	if pskGenerated == false {
		psk.Psk = "***"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(psk)

}

func reloadPSKFiles(w http.ResponseWriter, r *http.Request) {
  PSKmtx.Lock()
  defer PSKmtx.Unlock()

	//generate PSK files for host AP
	psks := getPSKJson()

	wpa2 := ""
	sae := ""

	for _, entry := range psks {
		if entry.Type == "sae" {
			sae += "sae_password=" + entry.Psk + "|mac=" + entry.Mac + "\n"
		} else if entry.Type == "wpa2" {
			wpa2 += entry.Mac + " " + entry.Psk + "\n"
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

	//regenerate the hostap configuration
	cmd := exec.Command("/scripts/regen_hostapd.sh")
	err = cmd.Run()
	if err != nil {
		log.Fatal(err)
	}

	//reload the hostapd configuration
	cmd = exec.Command("hostapd_cli", "-p", "/state/wifi/control", "reload")
	err = cmd.Run()
	if err != nil {
		log.Fatal(err)
	}

}

func main() {
	router := mux.NewRouter().StrictSlash(true)

	// internal for taking members from zones and putting them into nftable
	// verdict maps
	/*
		router.HandleFunc("/map/{name}", showMap).Methods("GET")
		router.HandleFunc("/map/{name}", updateMapElement).Methods("PUT")
		router.HandleFunc("/map/{name}", deleteMapElement).Methods("DELETE")
	*/

	// Zone management
	router.HandleFunc("/zones/", getZones).Methods("GET")
	router.HandleFunc("/zone/{name}", addZoneMember).Methods("PUT")
	router.HandleFunc("/zone/{name}", delZoneMember).Methods("DELETE")

	// PSK management for stations
	router.HandleFunc("/setPSK/", setPSK).Methods("PUT", "DELETE")
	router.HandleFunc("/reloadPSKFiles/", reloadPSKFiles).Methods("PUT")

	// DHCP actions
	router.HandleFunc("/dhcpUpdate/", dhcpUpdate).Methods("PUT")

	log.Fatal(http.ListenAndServe("127.0.0.1:8080", router))
}
