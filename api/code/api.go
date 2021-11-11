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
	"path"
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

func showMap(w http.ResponseWriter, r *http.Request) {
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

type PSKAuthFailure struct {
	Type   string
	Mac    string
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

	if pskf.Mac == "" || (pskf.Type != "sae" && pskf.Type != "wpa") || (pskf.Reason != "noentry" && pskf.Reason != "mismatch") {
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
		psk := PSKEntry{Psk: pendingPSK.Psk, Type: auth_type, Mac: pskf.Mac}
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
	Mac    string
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

	if pska.Iface == "" || pska.Event != "AP-STA-CONNECTED" || pska.Mac == "" {
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
			if k == pska.Mac {
				foundPSK = true
				break
			}
		}
		if !foundPSK {
			//assign MAC to pendingPSK
			pendingPsk.Mac = pska.Mac
			psks[pska.Mac] = pendingPsk
			pska.Status = "Assigned Pending PSK to new MAC"
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

// serves index file
func home(w http.ResponseWriter, r *http.Request) {
	p := path.Dir("./static/index.html")
	w.Header().Set("Content-type", "text/html")
	http.ServeFile(w, r, p)
}

func main() {
	savePSKs(loadPSKFiles())
	saveZones(getZoneFiles())

	unix_dhcpd_router := mux.NewRouter().StrictSlash(true)
	unix_wifid_router := mux.NewRouter().StrictSlash(true)
	external_router_authenticated := mux.NewRouter().StrictSlash(true)
	external_router_public := mux.NewRouter()

	// internal for taking members from zones and putting them into nftable
	// verdict maps
	/*
		router.HandleFunc("/map/{name}", showMap).Methods("GET")
		router.HandleFunc("/map/{name}", updateMapElement).Methods("PUT")
		router.HandleFunc("/map/{name}", deleteMapElement).Methods("DELETE")
	*/

	external_router_public.HandleFunc("/", home)

	//Misc
	external_router_authenticated.HandleFunc("/status/", getStatus).Methods("GET", "OPTIONS")
	// Zone management
	external_router_authenticated.HandleFunc("/zones/", getZones).Methods("GET")
	external_router_authenticated.HandleFunc("/zone/{name}", addZoneMember).Methods("PUT")
	external_router_authenticated.HandleFunc("/zone/{name}", delZoneMember).Methods("DELETE")
	//Assign a PSK
	external_router_authenticated.HandleFunc("/setPSK/", setPSK).Methods("PUT", "DELETE")
	//Force reload
	external_router_authenticated.HandleFunc("/reloadPSKFiles/", reloadPSKFiles).Methods("PUT")

	// PSK management for stations
	unix_wifid_router.HandleFunc("/reportPSKAuthFailure/", reportPSKAuthFailure).Methods("PUT")
	unix_wifid_router.HandleFunc("/reportPSKAuthSuccess/", reportPSKAuthSuccess).Methods("PUT")

	// DHCP actions
	unix_dhcpd_router.HandleFunc("/dhcpUpdate/", dhcpUpdate).Methods("PUT")

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
	methodsOk := handlers.AllowedMethods([]string{"GET", "HEAD", "POST", "PUT", "OPTIONS"})

	// start server listen
	// with error handling
	//log.Fatal(http.ListenAndServe(":" + os.Getenv("PORT"), handlers.CORS(originsOk, headersOk, methodsOk)(router)))

	if "" == os.Getenv("API_WEBAUTHN_ENABLED") {
		auth := new(authconfig)
		auth.username = os.Getenv("API_USERNAME")
		auth.password = os.Getenv("API_PASSWORD")
		if auth.username != "" && auth.password != "" {
			http.ListenAndServe("0.0.0.0:5201", handlers.CORS(originsOk, headersOk, methodsOk)(auth.basicAuth(external_router_authenticated, external_router_public)))
		}
	} else {
		auth := new(webauthnconfig)
		w, err := webauthn.New(&webauthn.Config{
			RPDisplayName: "SPR-Fi",
			RPID:          "localhost",
			RPOrigin:      "http://localhost:5201", // The origin URL for WebAuthn requests
		})

		if err != nil {
			log.Fatal("failed to create WebAuthn from config:", err)
		}
		auth.webAuthn = w

		http.ListenAndServe("0.0.0.0:5201", handlers.CORS(originsOk, headersOk, methodsOk)(auth.webAuthN(external_router_authenticated, external_router_public)))
	}

	go wifidServer.Serve(unixWifidListener)

	dhcpdServer.Serve(unixDhcpdListener)
}
