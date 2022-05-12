package main

import (
	crand "crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync"

	"github.com/duo-labs/webauthn/webauthn"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
)

var TEST_PREFIX = os.Getenv("TEST_PREFIX")
var ApiConfigPath = TEST_PREFIX + "/configs/base/api.json"

var DevicesConfigPath = TEST_PREFIX + "/configs/devices/"
var DevicesConfigFile = DevicesConfigPath + "devices.json"
var GroupsConfigFile = DevicesConfigPath + "groups.json"

var ApiTlsCert = "/configs/base/www-api.crt"
var ApiTlsKey = "/configs/base/www-api.key"

type InfluxConfig struct {
	URL    string
	Org    string
	Bucket string
	Token  string
}

type PluginConfig struct {
	Name     string
	URI      string
	UnixPath string
	Enabled  bool
}

type APIConfig struct {
	InfluxDB InfluxConfig
	Plugins  []PluginConfig
}

type GroupEntry struct {
	Name      string
	Disabled  bool
	GroupTags []string
}

type PSKEntry struct {
	Type string
	Psk  string
}

type DeviceEntry struct {
	Name       string
	MAC        string
	WGPubKey   string
	VLANTag    string
	RecentIP   string
	PSKEntry   PSKEntry
	Groups     []string
	DeviceTags []string
}

var config = APIConfig{}

func loadConfig() {
	data, err := ioutil.ReadFile(ApiConfigPath)
	if err != nil {
		fmt.Println(err)
	} else {
		err = json.Unmarshal(data, &config)
		if err != nil {
			fmt.Println(err)
		}
	}

	initTraffic(config)
}

func saveConfig() {
	file, _ := json.MarshalIndent(config, "", " ")
	err := ioutil.WriteFile(ApiConfigPath, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

var UNIX_WIFID_LISTENER = TEST_PREFIX + "/state/wifi/apisock"
var UNIX_DHCPD_LISTENER = TEST_PREFIX + "/state/dhcp/apisock"
var UNIX_WIREGUARD_LISTENER = TEST_PREFIX + "/state/plugins/wireguard/apisock"

func ipAddr(w http.ResponseWriter, r *http.Request) {
	cmd := exec.Command("ip", "-j", "addr")
	stdout, err := cmd.Output()

	if err != nil {
		fmt.Println("ipAddr failed", err)
		http.Error(w, "Not found", 404)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, string(stdout))
}

func ipLinkUpDown(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	state := mux.Vars(r)["state"]

	if state != "up" && state != "down" {
		http.Error(w, "state must be `up` or `down`", 400)
		return
	}

	cmd := exec.Command("ip", "link", "set", "dev", iface, state)
	_, err := cmd.Output()

	if err != nil {
		fmt.Println("ip link failed", err)
		http.Error(w, "ip link failed", 400)
		return
	}

}

func iwCommand(w http.ResponseWriter, r *http.Request) {
	command := mux.Vars(r)["command"]

	/*
	   allowed commands for now:
	   iw/list, iw/dev iw/dev/wlan0-9/scan
	*/
	validCommand := regexp.MustCompile(`^(list|dev)/?([a-z0-9\.]+\/scan)?$`).MatchString
	if !validCommand(command) {
		fmt.Println("invalid iw command")
		http.Error(w, "Invalid command", 400)
		return
	}

	args := strings.Split(command, "/")
	cmd := exec.Command("iw", args...)
	data, err := cmd.Output()
	if err != nil {
		fmt.Println("iw command error:", err)
		http.Error(w, err.Error(), 400)
		return
	}

	// use json parsers if available (iw_list, iw_dev, iw-scan)
	if command == "list" || command == "dev" || strings.HasSuffix(command, "scan") {
		parser := "--iw_" + command // bug: jc dont allow - when using local parsers
		if strings.HasSuffix(command, "scan") {
			parser = "--iw-scan"
		}

		cmd = exec.Command("jc", parser)

		stdin, err := cmd.StdinPipe()
		if err != nil {
			fmt.Println("iwCommand stdin pipe error:", err)
			http.Error(w, err.Error(), 400)
			return
		}

		go func() {
			defer stdin.Close()
			io.WriteString(stdin, string(data))
		}()

		stdout, err := cmd.Output()
		if err != nil {
			fmt.Println("iwCommand stdout error:", err)
			http.Error(w, err.Error(), 400)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, string(stdout))

		return
	}

	w.Header().Set("Content-Type", "text/plain")
	fmt.Fprintf(w, string(data))
}

func getStatus(w http.ResponseWriter, r *http.Request) {
	reply := "Online"
	WSNotifyString("StatusCalled", "test")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reply)
}

var Devicesmtx sync.Mutex

func saveDevicesJson(devices map[string]DeviceEntry) {
	file, _ := json.MarshalIndent(devices, "", " ")
	err := ioutil.WriteFile(DevicesConfigFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func getDevicesJson() map[string]DeviceEntry {
	devices := map[string]DeviceEntry{}
	data, err := ioutil.ReadFile(DevicesConfigFile)
	if err != nil {
		return nil
	}
	err = json.Unmarshal(data, &devices)
	if err != nil {
		log.Fatal(err)
	}
	return devices
}

func getDevices(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	devices := getDevicesJson()

	//mask PSKs
	for i, entry := range devices {
		if entry.PSKEntry.Psk != "" {
			entry.PSKEntry.Psk = "**"
			devices[i] = entry
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(devices)
}

func handleUpdateDevice(w http.ResponseWriter, r *http.Request) {
	identity := mux.Vars(r)["identity"]
	if strings.Contains(identity, ":") {
		//normalize MAC addresses
		identity = trimLower(identity)
	}

	if identity == "" {
		http.Error(w, "Invalid device identity", 400)
		return
	}

	dev := DeviceEntry{}
	err := json.NewDecoder(r.Body).Decode(&dev)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	updateDevice(w, r, dev, identity)
}

func updateDevice(w http.ResponseWriter, r *http.Request, dev DeviceEntry, identity string) {

	if dev.PSKEntry.Type != "" {
		if dev.PSKEntry.Type != "sae" && dev.PSKEntry.Type != "wpa2" {
			http.Error(w, "invalid PSK Type", 400)
			return
		}
	}

	if len(dev.PSKEntry.Psk) > 0 && len(dev.PSKEntry.Psk) < 8 {
		http.Error(w, "psk too short", 400)
		return
	}

	//normalize groups and tags
	dev.Groups = normalizeStringSlice(dev.Groups)
	dev.DeviceTags = normalizeStringSlice(dev.DeviceTags)
	dev.MAC = trimLower(dev.MAC)

	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()
	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()

	devices := getDevicesJson()
	groups := getGroupsJson()

	val, exists := devices[identity]

	if r.Method == http.MethodDelete {
		//delete a device
		if exists {
			delete(devices, identity)
			saveDevicesJson(devices)
			refreshDeviceGroups(val)
			doReloadPSKFiles()
			return
		}

		http.Error(w, "Not found", 404)
		return
	}

	//always overwrite pending
	if identity == "pending" {
		val = DeviceEntry{}
		exists = false
	}

	pskGenerated := false
	pskModified := false
	refreshGroups := false

	if exists {
		//updating an existing entry. Check what was requested

		if dev.Name != "" {
			val.Name = dev.Name
		}

		if dev.WGPubKey != "" {
			val.WGPubKey = dev.WGPubKey
		}

		if dev.VLANTag != "" {
			val.VLANTag = dev.VLANTag
		}

		if dev.RecentIP != "" {
			val.RecentIP = dev.RecentIP
		}

		if dev.PSKEntry.Psk != "" {
			//assign a new PSK
			pskModified = true
			val.PSKEntry.Psk = dev.PSKEntry.Psk
		}

		if dev.PSKEntry.Type != "" {
			pskModified = true
			val.PSKEntry.Type = dev.PSKEntry.Type

			//when setting PSK type, but the device
			// did not previously have a PSK set,
			// generate a secure PSK

			if val.PSKEntry.Psk == "" {
				val.PSKEntry.Psk = genSecurePassword()
				pskGenerated = true
			}
		}

		if dev.DeviceTags != nil && !equalStringSlice(val.DeviceTags, dev.DeviceTags) {
			val.DeviceTags = dev.DeviceTags
		}

		if dev.Groups != nil && !equalStringSlice(val.Groups, dev.Groups) {
			val.Groups = dev.Groups

			saveGroups := false

			//create a new zone if it does not exist yet
			for _, entry := range dev.Groups {
				foundGroup := false
				for _, group := range groups {
					if group.Name == entry {
						foundGroup = true
						break
					}
				}

				if !foundGroup {
					saveGroups = true
					newGroup := GroupEntry{}
					newGroup.Name = entry
					newGroup.GroupTags = []string{}
					groups = append(groups, newGroup)
				}
			}

			if saveGroups {
				saveGroupsJson(groups)
			}

			refreshGroups = true
		}

		devices[identity] = val
		saveDevicesJson(devices)

		if pskModified {
			//psks updated -- update hostapd
			doReloadPSKFiles()
		}

		if refreshGroups {
			refreshDeviceGroups(val)
		}

		//mask the PSK if set and not generated
		if val.PSKEntry.Psk != "" && pskGenerated == false {
			val.PSKEntry.Psk = "**"
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(val)
		return
	}

	//creating a new device entry

	if strings.Contains(identity, ":") {
		//looking at a MAC, set it if not set
		if dev.MAC == "" {
			dev.MAC = identity
		}
	}

	//generate secure PSK if needed
	if dev.PSKEntry.Type != "" {
		pskModified = true
		if dev.PSKEntry.Psk == "" {
			dev.PSKEntry.Psk = genSecurePassword()
			pskGenerated = true
		}
	}

	if dev.DeviceTags == nil {
		dev.DeviceTags = []string{}
	}

	if dev.Groups == nil {
		dev.Groups = []string{}
	}

	if len(dev.Groups) != 0 {
		//update verdict maps for the device
		refreshGroups = true
	}

	devices[identity] = dev
	saveDevicesJson(devices)

	if pskModified {
		//psks updated -- update hostapd
		doReloadPSKFiles()
	}

	if refreshGroups {
		refreshDeviceGroups(val)
	}

	if pskGenerated == false {
		dev.PSKEntry.Psk = "**"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dev)
}

func pendingPSK(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	devices := getDevicesJson()
	_, exists := devices["pending"]

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(exists)
}

func saveGroupsJson(groups []GroupEntry) {
	file, _ := json.MarshalIndent(groups, "", " ")
	err := ioutil.WriteFile(GroupsConfigFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func getGroupsJson() []GroupEntry {
	groups := []GroupEntry{}
	data, err := ioutil.ReadFile(GroupsConfigFile)
	if err != nil {
		return nil
	}
	err = json.Unmarshal(data, &groups)
	if err != nil {
		log.Fatal(err)
	}
	return groups
}

var Groupsmtx sync.Mutex

func getGroups(w http.ResponseWriter, r *http.Request) {
	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()
	groups := getGroupsJson()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(groups)
}

func updateGroups(w http.ResponseWriter, r *http.Request) {
	group := GroupEntry{}
	err := json.NewDecoder(r.Body).Decode(&group)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	group.Name = trimLower(group.Name)
	if group.Name == "" {
		http.Error(w, "Invalid group name", 400)
		return
	}

	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()
	groups := getGroupsJson()

	if r.Method == http.MethodDelete {
		//[]GroupEntry
		for idx, entry := range groups {
			if entry.Name == group.Name {
				groups := append(groups[:idx], groups[idx+1:]...)
				saveGroupsJson(groups)
				return
			}
		}

		http.Error(w, "Not found", 404)
		return
	}

	//find the zone or update it
	for idx, entry := range groups {
		if entry.Name == group.Name {
			entry.Disabled = group.Disabled
			entry.GroupTags = group.GroupTags
			groups[idx] = entry
			saveGroupsJson(groups)
			return
		}
	}

	if group.GroupTags == nil {
		group.GroupTags = []string{}
	}

	//make a new group
	groups = append(groups, group)
	saveGroupsJson(groups)
}

func trimLower(a string) string {
	return strings.TrimSpace(strings.ToLower(a))
}

func equalMAC(a string, b string) bool {
	return trimLower(a) == trimLower(b)
}

func normalizeStringSlice(a []string) []string {
	if len(a) == 0 {
		return a
	}
	ret := []string{}
	for _, entry := range a {
		ret = append(ret, trimLower(entry))
	}
	return ret
}

func equalStringSlice(a []string, b []string) bool {
	if len(a) != len(b) {
		return false
	}

	for i := 0; i < len(a); i++ {
		if a[i] != b[i] {
			return false
		}
	}

	return true
}

var (
	builtin_maps  = []string{"internet_access", "dns_access", "lan_access", "ethernet_filter"}
	default_zones = []string{"isolated", "lan", "wan", "dns"}
)

func getVerdictMapNames() []string {
	//get custom maps from zones
	custom_maps := []string{}
	zones := getGroupsJson()
	for _, z := range zones {
		skip := false
		for _, y := range default_zones {
			if y == z.Name {
				skip = true
				break
			}
		}
		if skip == false {
			custom_maps = append(custom_maps, z.Name+"_src_access")
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
		fmt.Println("getNFTVerdictMap failed to list", map_name, err)
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
	// the src_access table is the second half, and _dst_access is the first half
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

			//do not flush wireguard entries from vmaps unless the incoming device is on the same interface
			if strings.HasPrefix(Ifname, "wg") {
				if Ifname != entry.ifname {
					continue
				}
			} else if strings.HasPrefix(entry.ifname, "wg") {
				continue
			}

			if (entry.ipv4 == IP) || (matchInterface && (entry.ifname == Ifname)) || (equalMAC(entry.mac, MAC) && (MAC != "")) {
				if entry.mac != "" {
					err := exec.Command("nft", "delete", "element", "inet", "filter", name, "{", entry.ipv4, ".", entry.ifname, ".", entry.mac, ":", verdict, "}").Run()
					if err != nil {
						fmt.Println("nft delete failed", err)
					}
				} else {
					err := exec.Command("nft", "delete", "element", "inet", "filter", name, "{", entry.ipv4, ".", entry.ifname, ":", verdict, "}").Run()
					if err != nil {
						fmt.Println("nft delete failed", err)
						return
					}
				}
			}
		}
	}
}

func searchVmapsByMac(MAC string, VMaps []string) (error, string, string) {
	//Search verdict maps and return the ipv4 and interface name
	for _, name := range VMaps {
		entries := getNFTVerdictMap(name)
		for _, entry := range entries {
			if equalMAC(entry.mac, MAC) {
				if entry.ifname != "" && entry.ipv4 != "" {
					return nil, entry.ipv4, entry.ifname
				}
			}
		}
	}
	return errors.New("Mac not found"), "", ""
}

func updateArp(Ifname string, IP string, MAC string) {
	err := exec.Command("arp", "-i", Ifname, "-s", IP, MAC).Run()
	if err != nil {
		fmt.Println("arp -i", Ifname, IP, MAC, "failed", err)
		return
	}
}

func updateAddr(Router string, Ifname string) {
	err := exec.Command("ip", "addr", "add", Router+"/30", "dev", Ifname).Run()
	if err != nil {
		fmt.Println("update addr failed", Router, Ifname, err)
		return
	}
}

func addVerdictMac(IP string, MAC string, Iface string, Table string, Verdict string) {
	err := exec.Command("nft", "add", "element", "inet", "filter", Table, "{", IP, ".", Iface, ".", MAC, ":", Verdict, "}").Run()
	if err != nil {
		fmt.Println("addVerdictMac Failed", MAC, Iface, Table, err)
		return
	}
}

func addVerdict(IP string, Iface string, Table string) {
	err := exec.Command("nft", "add", "element", "inet", "filter", Table, "{", IP, ".", Iface, ":", "accept", "}").Run()
	if err != nil {
		fmt.Println("addVerdict Failed", Iface, Table, err)
		return
	}
}

func addDNSVerdict(IP string, Iface string) {
	addVerdict(IP, Iface, "dns_access")
}

func addLANVerdict(IP string, Iface string) {
	addVerdict(IP, Iface, "lan_access")
}

func addInternetVerdict(IP string, Iface string) {
	addVerdict(IP, Iface, "internet_access")
}

func addCustomVerdict(ZoneName string, IP string, Iface string) {
	//create verdict maps if they do not exist
	err := exec.Command("nft", "list", "map", "inet", "filter", ZoneName+"_dst_access").Run()
	if err != nil {
		//two verdict maps are used for establishing custom groups.
		// the {name}_dst_access map allows Inet packets to a certain IP/interface pair
		//the {name}_src_access part allows Inet packets from a IP/IFace set

		err = exec.Command("nft", "add", "map", "inet", "filter", ZoneName+"_src_access", "{", "type", "ipv4_addr", ".", "ifname", ":", "verdict", ";", "}").Run()
		if err != nil {
			fmt.Println("addCustomVerdict Failed", err)
			return
		}
		err = exec.Command("nft", "add", "map", "inet", "filter", ZoneName+"_dst_access", "{", "type", "ipv4_addr", ".", "ifname", ":", "verdict", ";", "}").Run()
		if err != nil {
			fmt.Println("addCustomVerdict Failed", err)
			return
		}
		err = exec.Command("nft", "insert", "rule", "inet", "filter", "CUSTOM_GROUPS", "ip", "daddr", ".", "oifname", "vmap", "@"+ZoneName+"_dst_access", "ip", "saddr", ".", "iifname", "vmap", "@"+ZoneName+"_src_access").Run()
		if err != nil {
			fmt.Println("addCustomVerdict Failed", err)
			return
		}
	}

	err = exec.Command("nft", "add", "element", "inet", "filter", ZoneName+"_dst_access", "{", IP, ".", Iface, ":", "continue", "}").Run()
	if err != nil {
		fmt.Println("addCustomVerdict Failed", err)
		return
	}

	err = exec.Command("nft", "add", "element", "inet", "filter", ZoneName+"_src_access", "{", IP, ".", Iface, ":", "accept", "}").Run()
	if err != nil {
		fmt.Println("addCustomVerdict Failed", err)
		return
	}
}

func populateVmapEntries(IP string, MAC string, Iface string, WGPubKey string) {
	zones := getGroupsJson()
	zonesDisabled := map[string]bool{}

	for _, zone := range zones {
		zonesDisabled[zone.Name] = zone.Disabled
	}

	devices := getDevicesJson()
	val, exists := devices[MAC]

	if MAC != "" {
		if !exists {
			//given a MAC that is not in the devices list. Exit
			return
		}
	} else if WGPubKey != "" {
		val, exists = devices[WGPubKey]
		//wg pub key is unknown, exit
		if !exists {
			return
		}
	}

	for _, zone_name := range val.Groups {
		//skip zones that are disabled
		if zonesDisabled[zone_name] {
			continue
		}
		switch zone_name {
		case "isolated":
			continue
		case "dns":
			addDNSVerdict(IP, Iface)
		case "lan":
			addLANVerdict(IP, Iface)
		case "wan":
			addInternetVerdict(IP, Iface)
		default:
			//custom group
			addCustomVerdict(zone_name, IP, Iface)
		}
	}

}

var LocalMappingsmtx sync.Mutex

func updateLocalMappings(IP string, Name string) {

	LocalMappingsmtx.Lock()
	defer LocalMappingsmtx.Unlock()

	var localMappingsPath = TEST_PREFIX + "/state/dns/local_mappings"
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

func shouldFlushByInterface(Iface string) bool {
	matchInterface := false
	vlansif := os.Getenv("VLANSIF")
	if len(vlansif) > 0 && strings.Contains(Iface, vlansif) {
		matchInterface = true
	}
	return matchInterface
}

type DHCPUpdate struct {
	IP     string
	MAC    string
	Name   string
	Iface  string
	Router string
}

func dhcpUpdate(w http.ResponseWriter, r *http.Request) {
	DHCPmtx.Lock()
	defer DHCPmtx.Unlock()

	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()

	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	//Handle networking tasks upon a DHCP
	dhcp := DHCPUpdate{}
	err := json.NewDecoder(r.Body).Decode(&dhcp)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	devices := getDevicesJson()
	val, exists := devices[dhcp.MAC]

	if !exists {
		//wireguard integration: smoothly handle a wireguard only device gaining a MAC for the first time
		val, exists = lookupWGDevice(&devices, "", dhcp.IP)
		if exists && val.MAC == "" && val.WGPubKey != "" {
			//If an entry has no MAC assigned and does have a WG Pub Key
			//assign a MAC and delete wg pubkey indexing. WIll be MAC indexed below
			val.MAC = dhcp.MAC
			delete(devices, val.WGPubKey)
		} else {
			//did not find a suitable entry
			exists = false
		}
	}

	if !exists {
		//create a new device entry
		newDevice := DeviceEntry{}
		newDevice.MAC = dhcp.MAC
		newDevice.RecentIP = dhcp.IP
		newDevice.Groups = []string{}
		newDevice.DeviceTags = []string{}
		devices[newDevice.MAC] = newDevice
	} else {
		//update recent IP
		val.RecentIP = dhcp.IP
		devices[dhcp.MAC] = val
	}
	saveDevicesJson(devices)

	WSNotifyValue("DHCPUpdateRequest", dhcp)

	//1. delete this ip, mac from any existing verdict maps
	flushVmaps(dhcp.IP, dhcp.MAC, dhcp.Iface, getVerdictMapNames(), shouldFlushByInterface(dhcp.Iface))

	//2. update static arp entry
	updateAddr(dhcp.Router, dhcp.Iface)

	updateArp(dhcp.Iface, dhcp.IP, dhcp.MAC)

	//3. add entry to appropriate verdict maps

	//add this MAC and IP to the ethernet filter
	addVerdictMac(dhcp.IP, dhcp.MAC, dhcp.Iface, "ethernet_filter", "return")

	populateVmapEntries(dhcp.IP, dhcp.MAC, dhcp.Iface, "")

	//4. update local mappings file for DNS
	updateLocalMappings(dhcp.IP, dhcp.Name)

	WSNotifyString("DHCPUpdateProcessed", "")
}

type WireguardUpdate struct {
	IP        string
	PublicKey string
	Iface     string
	Name      string
}

func wireguardUpdate(w http.ResponseWriter, r *http.Request) {
	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()

	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	wg := WireguardUpdate{}
	err := json.NewDecoder(r.Body).Decode(&wg)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	devices := getDevicesJson()
	val, exists := lookupWGDevice(&devices, wg.PublicKey, wg.IP)

	if r.Method == http.MethodDelete {
		//delete a device's public key
		if exists {
			if val.MAC == "" {
				//if no MAC is assigned, delete altogether
				delete(devices, val.WGPubKey)
			} else {
				//otherwise update the WGPubKey to be empty
				val.WGPubKey = ""
				devices[val.MAC] = val
			}
			//falls through to save
		} else {
			http.Error(w, "Not found", 404)
			return
		}
	} else {
		if !exists {
			//create a new device entry
			newDevice := DeviceEntry{}
			newDevice.RecentIP = wg.IP
			newDevice.WGPubKey = wg.PublicKey
			newDevice.Groups = []string{}
			newDevice.DeviceTags = []string{}
			devices[newDevice.WGPubKey] = newDevice
			val = newDevice
		} else {
			//update recent IP
			val.RecentIP = wg.IP
			//override WGPubKey
			if val.WGPubKey != wg.PublicKey {
				val.WGPubKey = wg.PublicKey
			}

			if val.MAC != "" {
				//key by MAC address when available
				devices[val.MAC] = val
				//remove WGPubKey
				delete(devices, val.WGPubKey)
			} else {
				//key by WGPubKey
				devices[val.WGPubKey] = val
			}
		}
	}

	saveDevicesJson(devices)

	refreshWireguardDevice(val.MAC, wg.IP, wg.PublicKey, wg.Iface, wg.Name, r.Method == http.MethodPut)
}

func toTinyIP(IP string, delta uint32) (bool, net.IP) {
	//check for tiny-net range, to have matching priority with wifi
	tinynet := os.Getenv("TINYNETSTART")
	if tinynet != "" {
		_, subnet, _ := net.ParseCIDR(tinynet + "/24")
		net_ip := net.ParseIP(IP)
		if subnet.Contains(net_ip) {
			u := binary.BigEndian.Uint32(net_ip.To4()) - delta
			ip := net.IPv4(byte(u>>24), byte(u>>16), byte(u>>8), byte(u))
			return true, ip
		}
	}

	return false, net.IP{}
}

func refreshWireguardDevice(MAC string, IP string, PublicKey string, Iface string, Name string, Create bool) {
	//1. delete this ip from any existing verdict maps for the same wireguard interface
	flushVmaps(IP, MAC, Iface, getVerdictMapNames(), false)

	if Create {
		//2.  Add route

		routeIP := IP
		is_tiny, newIP := toTinyIP(IP, 2)
		if is_tiny {
			routeIP = newIP.String() + "/30"
		}

		err := exec.Command("ip", "route", "add", routeIP, "dev", Iface, "metric", "200").Run()
		if err != nil {
			fmt.Println("ip route add failed", IP, err)
		}

		//3. add entry to the appropriate verdict maps
		populateVmapEntries(IP, MAC, Iface, PublicKey)

		//4. update local mappings file for DNS
		if Name != "" {
			updateLocalMappings(IP, Name)
		}
	}
}

func lookupWGDevice(devices *map[string]DeviceEntry, WGPubKey string, IP string) (DeviceEntry, bool) {
	//match first WGPubKey, then first RecentIP
	for _, device := range *devices {
		if WGPubKey != "" && device.WGPubKey == WGPubKey {
			return device, true
		}

		if IP != "" && device.RecentIP == IP {
			return device, true
		}
	}
	return DeviceEntry{}, false
}

func refreshDeviceGroups(dev DeviceEntry) {
	if dev.WGPubKey != "" {
		//refresh wg based on WGPubKey
		refreshWireguardDevice(dev.MAC, dev.RecentIP, dev.WGPubKey, "wg0", "", true)
	}

	ifname := ""
	ipv4 := ""
	//check arp tables for the MAC to get the IP
	arp_entry, err := GetArpEntryFromMAC(dev.MAC)
	if err != nil {
		fmt.Println("Arp entry not found, insufficient information to refresh", dev.MAC)
		return
	}

	ipv4 = arp_entry.IP

	//check dhcp vmap for the interface
	entries := getNFTVerdictMap("dhcp_access")
	for _, entry := range entries {
		if equalMAC(entry.mac, dev.MAC) {
			ifname = entry.ifname
		}
	}

	if ifname == "" {
		fmt.Println("dhcp_access entry not found, insufficient information to refresh", dev.MAC)
		return
	}

	//remove from existing verdict maps
	flushVmaps(ipv4, dev.MAC, ifname, getVerdictMapNames(), shouldFlushByInterface(ifname))

	//and re-add
	populateVmapEntries(ipv4, dev.MAC, ifname, "")
}

// from https://github.com/ItsJimi/go-arp/blob/master/arp.go
// Entry define the list available in /proc/net/arp
type ArpEntry struct {
	IP     string
	HWType string
	Flags  string
	MAC    string
	Mask   string
	Device string
}

func removeWhiteSpace(tab []string) []string {
	var newTab []string
	for _, element := range tab {
		if element == "" {
			continue
		}
		newTab = append(newTab, element)
	}

	return newTab
}

// GetArpEntries lists ARP entries in /proc/net/arp
func GetArpEntries() ([]ArpEntry, error) {
	fileDatas, err := ioutil.ReadFile("/proc/net/arp")
	if err != nil {
		return nil, err
	}

	entries := []ArpEntry{}
	datas := strings.Split(string(fileDatas), "\n")
	for i, data := range datas {
		if i == 0 || data == "" {
			continue
		}
		parsedData := removeWhiteSpace(strings.Split(data, " "))
		entries = append(entries, ArpEntry{
			IP:     parsedData[0],
			HWType: parsedData[1],
			Flags:  parsedData[2],
			MAC:    parsedData[3],
			Mask:   parsedData[4],
			Device: parsedData[5],
		})
	}

	return entries, nil
}

// GetEntryFromMAC get an entry by searching with MAC address
func GetArpEntryFromMAC(mac string) (ArpEntry, error) {
	entries, err := GetArpEntries()
	if err != nil {
		return ArpEntry{}, err
	}

	for _, entry := range entries {
		if entry.MAC == mac {
			return entry, nil
		}
	}

	return ArpEntry{}, errors.New("MAC address not found")
}

func showARP(w http.ResponseWriter, r *http.Request) {
	entries, err := GetArpEntries()
	if err != nil {
		fmt.Println(err)
		http.Error(w, "Failed to get entries", 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

type PSKAuthFailure struct {
	Type   string
	MAC    string
	Reason string
	Status string
}

func reportPSKAuthFailure(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	pskf := PSKAuthFailure{}
	err := json.NewDecoder(r.Body).Decode(&pskf)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	WSNotifyValue("PSKAuthFailure", pskf)

	if pskf.MAC == "" || (pskf.Type != "sae" && pskf.Type != "wpa") || (pskf.Reason != "noentry" && pskf.Reason != "mismatch") {
		http.Error(w, "malformed data", 400)
		return
	}

	//no longer assign MAC on Auth Failure due to noentry

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
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	pska := PSKAuthSuccess{}
	err := json.NewDecoder(r.Body).Decode(&pska)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	WSNotifyValue("PSKAuthSuccess", pska)

	if pska.Iface == "" || pska.Event != "AP-STA-CONNECTED" || pska.MAC == "" {
		http.Error(w, "malformed data", 400)
		return
	}

	pska.Status = "Okay"

	//check if there is a pending psk to assign. if the mac is not known, then it was the pending psk

	devices := getDevicesJson()
	pendingPsk, exists := devices["pending"]
	if exists {
		var foundPSK = false
		for _, device := range devices {
			if device.MAC == pska.MAC {
				foundPSK = true
				break
			}
		}

		//psk not in known devices. Assign it and delete pending
		if !foundPSK {
			//assign MAC to pendingPSK
			pendingPsk.MAC = pska.MAC
			devices[pska.MAC] = pendingPsk
			pska.Status = "Installed Pending PSK"
			delete(devices, "pending")
			saveDevicesJson(devices)
			doReloadPSKFiles()
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pska)
}

func genSecurePassword() string {
	pw := make([]byte, 16)
	n, err := crand.Read(pw)
	if n != 16 || err != nil {
		log.Fatal(err)
	}
	return base64.RawURLEncoding.EncodeToString(pw)
}

func reloadPSKFiles(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()
	doReloadPSKFiles()
}

func doReloadPSKFiles() {
	//generate PSK files for hostapd
	devices := getDevicesJson()

	wpa2 := ""
	sae := ""

	for keyval, entry := range devices {
		if keyval == "pending" {
			//set wildcard password at front. hostapd uses a FILO for the sae keys
			if entry.PSKEntry.Type == "sae" {
				sae = entry.PSKEntry.Psk + "|mac=ff:ff:ff:ff:ff:ff" + "\n" + sae
				//apple downgrade workaround https://feedbackassistant.apple.com/feedback/9991042
				wpa2 = "00:00:00:00:00:00 " + entry.PSKEntry.Psk + "\n" + wpa2
			} else if entry.PSKEntry.Type == "wpa2" {
				wpa2 = "00:00:00:00:00:00 " + entry.PSKEntry.Psk + "\n" + wpa2
			}
		} else {
			if entry.PSKEntry.Type == "sae" {
				sae += entry.PSKEntry.Psk + "|mac=" + entry.MAC + "\n"
				//apple downgrade workaround https://feedbackassistant.apple.com/feedback/9991042
				wpa2 += entry.MAC + " " + entry.PSKEntry.Psk + "\n"
			} else if entry.PSKEntry.Type == "wpa2" {
				wpa2 += entry.MAC + " " + entry.PSKEntry.Psk + "\n"
			}
		}
	}

	err := ioutil.WriteFile(TEST_PREFIX+"/configs/wifi/sae_passwords", []byte(sae), 0644)
	if err != nil {
		log.Fatal(err)
	}
	err = ioutil.WriteFile(TEST_PREFIX+"/configs/wifi/wpa2pskfile", []byte(wpa2), 0644)
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

func getLogs(w http.ResponseWriter, r *http.Request) {
	// TODO params : --since "1 hour ago" --until "50 minutes ago"
	// 2000 entries ~2mb of data
	data, err := exec.Command("journalctl", "-u", "docker.service", "-r", "-n", "2000", "-o", "json").Output()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	logs := strings.Replace(strings.Trim(string(data), "\n"), "\n", ",", -1)
	fmt.Fprintf(w, "[%s]", logs)
}

func getCert(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/plain")
	http.ServeFile(w, r, ApiTlsCert)
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

func setSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		handler.ServeHTTP(w, r)
	})
}

func main() {

	loadConfig()

	auth := new(authnconfig)
	w, err := webauthn.New(&webauthn.Config{
		RPDisplayName: "SPR",
		RPID:          "localhost",
		RPOrigin:      "http://localhost:3000", // The origin URL for WebAuthn requests
	})

	if err != nil {
		log.Fatal("failed to create WebAuthn from config:", err)
	}

	auth.webAuthn = w

	unix_dhcpd_router := mux.NewRouter().StrictSlash(true)
	unix_wifid_router := mux.NewRouter().StrictSlash(true)
	unix_wireguard_router := mux.NewRouter().StrictSlash(true)
	external_router_authenticated := mux.NewRouter().StrictSlash(true)
	external_router_public := mux.NewRouter()

	external_router_public.Use(setSecurityHeaders)
	external_router_authenticated.Use(setSecurityHeaders)

	//public websocket with internal authentication
	external_router_public.HandleFunc("/ws", auth.webSocket).Methods("GET")

	//download cert from http
	external_router_public.HandleFunc("/cert", getCert).Methods("GET")

	spa := spaHandler{staticPath: "/ui", indexPath: "index.html"}
	external_router_public.PathPrefix("/").Handler(spa)

	//nftable helpers
	external_router_authenticated.HandleFunc("/nfmap/{name}", showNFMap).Methods("GET")
	external_router_authenticated.HandleFunc("/nftables", listNFTables).Methods("GET")
	external_router_authenticated.HandleFunc("/nftable/{family}/{name}", showNFTable).Methods("GET")

	// firewall
	external_router_authenticated.HandleFunc("/firewall/config", getFirewallConfig).Methods("GET")
	external_router_authenticated.HandleFunc("/firewall/forward", modifyForwardRules).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/block", blockIP).Methods("PUT", "DELETE")

	//traffic monitoring
	external_router_authenticated.HandleFunc("/traffic/{name}", getDeviceTraffic).Methods("GET")
	external_router_authenticated.HandleFunc("/traffic_history", getTrafficHistory).Methods("GET")
	external_router_authenticated.HandleFunc("/iptraffic", getIPTraffic).Methods("GET")

	//ARP
	external_router_authenticated.HandleFunc("/arp", showARP).Methods("GET")

	//Misc
	external_router_authenticated.HandleFunc("/status", getStatus).Methods("GET", "OPTIONS")

	//device management
	external_router_authenticated.HandleFunc("/groups", getGroups).Methods("GET")
	external_router_authenticated.HandleFunc("/groups", updateGroups).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/devices", getDevices).Methods("GET")
	external_router_authenticated.HandleFunc("/device/{identity:.*}", handleUpdateDevice).Methods("PUT", "DELETE")

	external_router_authenticated.HandleFunc("/pendingPSK", pendingPSK).Methods("GET")

	//force reload
	external_router_authenticated.HandleFunc("/reloadPSKFiles", reloadPSKFiles).Methods("PUT")

	//hostapd information
	external_router_authenticated.HandleFunc("/hostapd/status", hostapdStatus).Methods("GET")
	external_router_authenticated.HandleFunc("/hostapd/all_stations", hostapdAllStations).Methods("GET")
	external_router_authenticated.HandleFunc("/hostapd/config", hostapdConfig).Methods("GET")
	external_router_authenticated.HandleFunc("/hostapd/config", hostapdUpdateConfig).Methods("PUT")

	//ip information
	external_router_authenticated.HandleFunc("/ip/addr", ipAddr).Methods("GET")
	external_router_authenticated.HandleFunc("/ip/link/{interface}/{state}", ipLinkUpDown).Methods("PUT")

	//iw list
	external_router_authenticated.HandleFunc("/iw/{command:.*}", iwCommand).Methods("GET")

	//logs
	external_router_authenticated.HandleFunc("/logs", getLogs).Methods("GET")

	//plugins
	external_router_authenticated.HandleFunc("/plugins", getPlugins).Methods("GET")
	external_router_authenticated.HandleFunc("/plugins/{name}", updatePlugins).Methods("PUT", "DELETE")

	// tokens api
	external_router_authenticated.HandleFunc("/tokens", getAuthTokens).Methods("GET")
	external_router_authenticated.HandleFunc("/tokens", updateAuthTokens).Methods("PUT", "DELETE")

	// PSK management for stations
	unix_wifid_router.HandleFunc("/reportPSKAuthFailure", reportPSKAuthFailure).Methods("PUT")
	unix_wifid_router.HandleFunc("/reportPSKAuthSuccess", reportPSKAuthSuccess).Methods("PUT")

	// DHCP actions
	unix_dhcpd_router.HandleFunc("/dhcpUpdate", dhcpUpdate).Methods("PUT")

	// Wireguard actions
	unix_wireguard_router.HandleFunc("/wireguardUpdate", wireguardUpdate).Methods("PUT", "DELETE")

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

	os.Remove(UNIX_WIREGUARD_LISTENER)
	unixWireguardListener, err := net.Listen("unix", UNIX_WIREGUARD_LISTENER)
	if err != nil {
		panic(err)
	}

	PluginRoutes(external_router_authenticated)

	wifidServer := http.Server{Handler: logRequest(unix_wifid_router)}
	dhcpdServer := http.Server{Handler: logRequest(unix_dhcpd_router)}
	wireguardServer := http.Server{Handler: logRequest(unix_wireguard_router)}

	headersOk := handlers.AllowedHeaders([]string{"X-Requested-With", "Content-Type", "Authorization"})
	originsOk := handlers.AllowedOrigins([]string{"*"})
	methodsOk := handlers.AllowedMethods([]string{"GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"})

	//initialize user firewall rules
	initUserFirewallRules()
	//start the websocket handler
	WSRunNotify()
	// collect traffic accounting statistics
	trafficTimer()

	sslPort, runSSL := os.LookupEnv("API_SSL_PORT")

	if runSSL {
		listenPort, err := strconv.Atoi(sslPort)
		if err != nil {
			listenPort = 443
		}

		listenAddr := fmt.Sprint("0.0.0.0:", listenPort)

		go http.ListenAndServeTLS(listenAddr, ApiTlsCert, ApiTlsKey, logRequest(handlers.CORS(originsOk, headersOk, methodsOk)(auth.Authenticate(external_router_authenticated, external_router_public))))
	}

	go http.ListenAndServe("0.0.0.0:80", logRequest(handlers.CORS(originsOk, headersOk, methodsOk)(auth.Authenticate(external_router_authenticated, external_router_public))))

	go wifidServer.Serve(unixWifidListener)

	go dhcpdServer.Serve(unixDhcpdListener)

	wireguardServer.Serve(unixWireguardListener)
}
