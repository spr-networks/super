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
	"reflect"
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
var ApiVersionFile = TEST_PREFIX + "/version.txt"

var DevicesConfigPath = TEST_PREFIX + "/configs/devices/"
var DevicesConfigFile = DevicesConfigPath + "devices.json"
var DevicesPublicConfigFile = TEST_PREFIX + "/state/public/devices-public.json"

var GroupsConfigFile = DevicesConfigPath + "groups.json"

var ConfigFile = TEST_PREFIX + "/configs/base/config.sh"

var ApiTlsCert = "/configs/base/www-api.crt"
var ApiTlsKey = "/configs/base/www-api.key"

var SuperdSocketPath = TEST_PREFIX + "/state/plugins/superd/socket"

type InfluxConfig struct {
	URL    string
	Org    string
	Bucket string
	Token  string
}

type PluginConfig struct {
	Name            string
	URI             string
	UnixPath        string
	Enabled         bool
	Plus            bool
	GitURL          string
	ComposeFilePath string
}

type APIConfig struct {
	InfluxDB  InfluxConfig
	Plugins   []PluginConfig
	PlusToken string
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

var DEVICE_TAG_PERMIT_PRIVATE_UPSTREAM_ACCESS = "lan_upstream"

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

	//loading this will make sure devices-public.json is made
	getDevicesJson()

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
var UNIX_WIREGUARD_LISTENER_PATH = TEST_PREFIX + "/state/plugins/wireguard/"
var UNIX_WIREGUARD_LISTENER = UNIX_WIREGUARD_LISTENER_PATH + "apisock"

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

func getStatus(w http.ResponseWriter, r *http.Request) {
	reply := "Online"
	WSNotifyString("StatusCalled", "test")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reply)
}

func getFeatures(w http.ResponseWriter, r *http.Request) {
	reply := []string{"dns"}
	//check which features are enabled
	if os.Getenv("VIRTUAL_SPR") == "" {
		reply = append(reply, "wifi")
	}

	if os.Getenv("PPPIF") != "" {
		reply = append(reply, "ppp")
	}

	if os.Getenv("WIREGUARD_PORT") != "" {
		reply = append(reply, "wireguard")
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reply)
}

// system info: uptime, docker ps etc.
func getInfo(w http.ResponseWriter, r *http.Request) {
	DockerSocketPath := "/var/run/docker.sock"

	name := mux.Vars(r)["name"]

	var data []byte
	var err error

	if name == "uptime" {
		cmd := exec.Command("uptime")
		output, err := cmd.Output()

		cmd = exec.Command("jc", "--uptime")
		stdin, err := cmd.StdinPipe()
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		go func() {
			defer stdin.Close()
			io.WriteString(stdin, string(output))
		}()

		data, err = cmd.Output()
	} else if name == "docker" {
		c := http.Client{}
		c.Transport = &http.Transport{
			Dial: func(network, addr string) (net.Conn, error) {
				return net.Dial("unix", DockerSocketPath)
			},
		}

		req, err := http.NewRequest(http.MethodGet, "http://localhost/v1.41/containers/json?all=1", nil)
		if err != nil {
			http.Error(w, err.Error(), 404)
			return
		}

		resp, err := c.Do(req)
		if err != nil {
			http.Error(w, err.Error(), 404)
			return
		}

		defer resp.Body.Close()
		data, err = ioutil.ReadAll(resp.Body)
	} else if name == "hostname" {
		hostname, err := os.Hostname()
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		data = []byte(fmt.Sprintf("%q", hostname))
	} else if name == "ss" {
		data, err = exec.Command("jc", "-p", "ss", "-4", "-n").Output()
	} else {
		http.Error(w, "Invalid info", 404)
		return
	}

	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, string(data))
}

// get spr version
func getVersion(w http.ResponseWriter, r *http.Request) {
	data, err := ioutil.ReadFile(ApiVersionFile)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(string(data))
}

var Devicesmtx sync.Mutex

func convertDevicesPublic(devices map[string]DeviceEntry) map[string]DeviceEntry {
	// do not pass PSK key material
	scrubbed_devices := make(map[string]DeviceEntry)
	for i, entry := range devices {
		new_entry := entry
		if new_entry.PSKEntry.Psk != "" {
			new_entry.PSKEntry.Psk = "**"
		}
		scrubbed_devices[i] = new_entry
	}
	return scrubbed_devices
}

func savePublicDevicesJson(scrubbed_devices map[string]DeviceEntry) {
	file, _ := json.MarshalIndent(scrubbed_devices, "", " ")
	err := ioutil.WriteFile(DevicesPublicConfigFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func saveDevicesJson(devices map[string]DeviceEntry) {
	file, _ := json.MarshalIndent(devices, "", " ")
	err := ioutil.WriteFile(DevicesConfigFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}

	scrubbed_devices := convertDevicesPublic(devices)
	savePublicDevicesJson(scrubbed_devices)

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

	scrubbed_devices := convertDevicesPublic(devices)

	// load the public file. if it does not match, remake it.
	data, err = ioutil.ReadFile(DevicesPublicConfigFile)
	if err != nil {
		// file was not made yet
		savePublicDevicesJson(scrubbed_devices)
	} else {
		public_devices := map[string]DeviceEntry{}
		err = json.Unmarshal(data, &public_devices)
		if err != nil {
			//data was invalid
			savePublicDevicesJson(scrubbed_devices)
		} else if !reflect.DeepEqual(public_devices, scrubbed_devices) {
			//an update was since made
			savePublicDevicesJson(scrubbed_devices)
		}
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
	identity := r.URL.Query().Get("identity")

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

	errorMsg, code := updateDevice(w, r, dev, identity)

	if code != 200 {
		http.Error(w, errorMsg, code)
		return
	}

}


func syncDevices(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	devices := map[string]DeviceEntry{}
	err := json.NewDecoder(r.Body).Decode(&devices)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	saveDevicesJson(devices)

	for _, val := range devices {
		refreshDeviceGroups(val)
		refreshDeviceTags(val)
	}

	doReloadPSKFiles()
}


func updateDevice(w http.ResponseWriter, r *http.Request, dev DeviceEntry, identity string) (string, int) {

	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()
	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()

	devices := getDevicesJson()
	groups := getGroupsJson()

	// copy another device
	sourceDeviceMAC := r.URL.Query().Get("copy")
	if sourceDeviceMAC != "" {
		sourceDevice, exists := devices[sourceDeviceMAC]

		if !exists {
			return "invalid source device", 400
		}

		dev.PSKEntry.Type = sourceDevice.PSKEntry.Type
		dev.PSKEntry.Psk = sourceDevice.PSKEntry.Psk
	}

	if dev.PSKEntry.Type != "" {
		if dev.PSKEntry.Type != "sae" && dev.PSKEntry.Type != "wpa2" {
			return "invalid PSK Type", 400
		}
	}

	if len(dev.PSKEntry.Psk) > 0 && len(dev.PSKEntry.Psk) < 8 {
		return "psk too short", 400
	}

	//normalize groups and tags
	dev.Groups = normalizeStringSlice(dev.Groups)
	dev.DeviceTags = normalizeStringSlice(dev.DeviceTags)
	dev.MAC = trimLower(dev.MAC)

	val, exists := devices[identity]

	if r.Method == http.MethodDelete {
		//delete a device
		if exists {
			delete(devices, identity)
			saveDevicesJson(devices)
			refreshDeviceGroups(val)
			doReloadPSKFiles()
			return "", 200
		}

		return "Not found", 404
	}

	//always overwrite pending
	if identity == "pending" {
		val = DeviceEntry{}
		exists = false
	}

	pskGenerated := false
	pskModified := false
	refreshGroups := false
	refreshTags := false

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
			refreshTags = true
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

		if refreshTags {
			refreshDeviceTags(val)
		}

		//mask the PSK if set and not generated
		if val.PSKEntry.Psk != "" && pskGenerated == false {
			val.PSKEntry.Psk = "**"
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(val)
		return "", 200
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

	return "", 200
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

	Interfacesmtx.Lock()
	//read the old configuration
	config := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()

	for _, entry := range config {
		if entry.Enabled && entry.Type == "AP" {
			if strings.Contains(Iface, entry.Name+".") {
				matchInterface = true
				break
			}
		}
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

func refreshDeviceTags(dev DeviceEntry) {
	applyPrivateNetworkUpstreamDevice(dev)
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

	//add this MAC and IP to the ethernet filter
	addVerdictMac(ipv4, dev.MAC, ifname, "ethernet_filter", "return")

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

func getLogs(w http.ResponseWriter, r *http.Request) {
	// TODO params : --since "1 hour ago" --until "50 minutes ago"
	// 2000 entries ~2mb of data
	//data, err := exec.Command("journalctl", "-u", "docker.service", "-r", "-n", "2000", "-o", "json").Output()
	data, err := exec.Command("journalctl", "-r", "-n", "2000", "-o", "json").Output()
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

func speedTest(w http.ResponseWriter, r *http.Request) {
	startParam := mux.Vars(r)["start"]
	endParam := mux.Vars(r)["end"]

	start, err := strconv.ParseUint(startParam, 10, 64)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	end, err := strconv.ParseUint(endParam, 10, 64)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if end <= start {
		http.Error(w, "Invalid range", 400)
		return
	}

	size := end - start
	maxSize := 25 * 1024 * 1024 // 25MB
	if size >= uint64(maxSize) {
		http.Error(w, "Invalid size, max 25MB", 400)
		return
	}

	sz := strconv.Itoa(int(size))

	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Length", sz)

		v := make([]byte, int(size))

		for i := 0; i < int(size); i++ {
			v[i] = byte(0x30 + i%10)
		}

		w.Write(v)
	} else if r.Method == http.MethodPut {
		r.Body = http.MaxBytesReader(w, r.Body, int64(maxSize))

		// check if request body is not too large
		_, err := ioutil.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte("ok"))
	} else {
		http.Error(w, "Invalid method", 400)
		return
	}
}

type SetupConfig struct {
	SSID            string
	CountryCode     string
	AdminPassword   string
	InterfaceAP     string
	InterfaceUplink string
}

func isSetupMode() bool {
	_, err := os.Stat(AuthUsersFile)
	if err == nil || !os.IsNotExist(err) {
		return false
	}

	return true
}

// initial setup only available if there is no user/pass configured
func setup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if !isSetupMode() {
		http.Error(w, "setup already done", 400)
		return
	}

	if r.Method != http.MethodPut {
		// TODO could list interfaces available for uplink and wifi
		fmt.Fprintf(w, "{\"status\": \"ok\"}")
		return
	}

	// setup is not done
	conf := SetupConfig{}
	err := json.NewDecoder(r.Body).Decode(&conf)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	validCountry := regexp.MustCompile(`^[A-Z]{2}$`).MatchString // EN,SE
	//SSID: up to 32 alphanumeric, case-sensitive, characters
	//Invalid characters: +, ], /, ", TAB, and trailing spaces
	//The first character cannot be !, #, or ; character
	validSSID := regexp.MustCompile(`^[^!#;+\]\/"\t][^+\]\/"\t]{0,30}[^ +\]\/"\t]$|^[^ !#;+\]\/"\t]$[ \t]+$`).MatchString

	if conf.InterfaceAP == "" || !validInterface(conf.InterfaceAP) {
		http.Error(w, "Invalid AP interface", 400)
		return
	}

	if conf.InterfaceUplink == "" {
		http.Error(w, "Invalid Uplink interface", 400)
		return
	}

	if !validSSID(conf.SSID) {
		http.Error(w, "Invalid SSID", 400)
		return
	}

	// TODO country => channels
	if !validCountry(conf.CountryCode) {
		http.Error(w, "Invalid Country Code", 400)
		return
	}

	if conf.AdminPassword == "" {
		http.Error(w, "Password cannot be empty", 400)
		return
	}

	// write to auth_users.json
	users := fmt.Sprintf("{%q: %q}", "admin", conf.AdminPassword)
	err = ioutil.WriteFile(AuthUsersFile, []byte(users), 0644)
	if err != nil {
		http.Error(w, "Failed to write user auth file", 400)
		panic(err)
	}

	//write to config.sh
	data, err := ioutil.ReadFile(ConfigFile)
	if err != nil {
		// we can use default template config here but better to copy it before in bash
		http.Error(w, "Missing default config.sh", 400)
		return
	}

	configData := string(data)
	matchInterfaceUplink := regexp.MustCompile(`(?m)^(WANIF)=(.*)`)

	configData = matchInterfaceUplink.ReplaceAllString(configData, "$1="+conf.InterfaceUplink)

	err = ioutil.WriteFile(ConfigFile, []byte(configData), 0755)
	if err != nil {
		http.Error(w, "Failed to write config to "+ConfigFile, 400)
		panic(err)
	}

	//generate and write to hostapd_iface.conf
	data, err = ioutil.ReadFile(getHostapdConfigPath("template"))
	if err != nil {
		// we can use default template config here but better to copy it before in bash
		http.Error(w, "Missing default hostapd config", 400)
		return
	}

	configData = string(data)
	matchSSID := regexp.MustCompile(`(?m)^(ssid)=(.*)`)
	matchInterfaceAP := regexp.MustCompile(`(?m)^(interface)=(.*)`)
	matchCountry := regexp.MustCompile(`(?m)^(country_code)=(.*)`)
	matchControl := regexp.MustCompile(`(?m)^(ctrl_interface)=(.*)`)

	configData = matchSSID.ReplaceAllString(configData, "$1="+conf.SSID)
	configData = matchInterfaceAP.ReplaceAllString(configData, "$1="+conf.InterfaceAP)
	configData = matchCountry.ReplaceAllString(configData, "$1="+conf.CountryCode)
	configData = matchControl.ReplaceAllString(configData, "$1="+"/state/wifi/control_"+conf.InterfaceAP)

	hostapd_path := getHostapdConfigPath(conf.InterfaceAP)
	err = ioutil.WriteFile(hostapd_path, []byte(configData), 0755)
	if err != nil {
		http.Error(w, "Failed to write config to "+hostapd_path, 400)
		panic(err)
	}

	configureInterface("AP", conf.InterfaceAP)
	configureInterface("Uplink", conf.InterfaceUplink)

	fmt.Fprintf(w, "{\"status\": \"done\"}")
	callSuperdRestart("")
}

func callSuperdRestart(target string) {
	c := http.Client{}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", SuperdSocketPath)
		},
	}

	append := ""
	if target != "" {
		append += "?service=" + target
	}
	req, err := http.NewRequest(http.MethodGet, "http://localhost/restart"+append, nil)
	if err != nil {
		return
	}

	resp, err := c.Do(req)
	if err != nil {
		return
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)
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
	external_router_setup := mux.NewRouter().StrictSlash(true)

	external_router_public.Use(setSecurityHeaders)
	external_router_authenticated.Use(setSecurityHeaders)
	external_router_setup.Use(setSecurityHeaders)

	//public websocket with internal authentication
	external_router_public.HandleFunc("/ws", auth.webSocket).Methods("GET")

	// intial setup
	external_router_public.HandleFunc("/setup", setup).Methods("GET", "PUT")
	external_router_setup.HandleFunc("/ip/addr", ipAddr).Methods("GET")
	external_router_setup.HandleFunc("/hostapd/{interface}/config", hostapdConfig).Methods("GET")
	external_router_setup.HandleFunc("/hostapd/{interface}/config", hostapdUpdateConfig).Methods("PUT")
	external_router_setup.HandleFunc("/hostapd/{interface}/setChannel", hostapdChannelSwitch).Methods("PUT")
	external_router_setup.HandleFunc("/iw/{command:.*}", iwCommand).Methods("GET")

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
	external_router_authenticated.HandleFunc("/firewall/block_forward", blockForwardingIP).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/service_port", modifyServicePort).Methods("PUT", "DELETE")

	//traffic monitoring
	external_router_authenticated.HandleFunc("/traffic/{name}", getDeviceTraffic).Methods("GET")
	external_router_authenticated.HandleFunc("/traffic_history", getTrafficHistory).Methods("GET")
	external_router_authenticated.HandleFunc("/iptraffic", getIPTraffic).Methods("GET")

	//ARP
	external_router_authenticated.HandleFunc("/arp", showARP).Methods("GET")

	//Misc
	external_router_authenticated.HandleFunc("/status", getStatus).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/features", getFeatures).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/info/{name}", getInfo).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/version", getVersion).Methods("GET", "OPTIONS")

	//device management
	external_router_authenticated.HandleFunc("/groups", getGroups).Methods("GET")
	external_router_authenticated.HandleFunc("/groups", updateGroups).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/devices", getDevices).Methods("GET")
	external_router_authenticated.HandleFunc("/device", handleUpdateDevice).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/devicesSync", syncDevices).Methods("PUT")

	external_router_authenticated.HandleFunc("/pendingPSK", pendingPSK).Methods("GET")

	//force reload
	external_router_authenticated.HandleFunc("/reloadPSKFiles", reloadPSKFiles).Methods("PUT")

	//hostapd information
	external_router_authenticated.HandleFunc("/hostapd/{interface}/status", hostapdStatus).Methods("GET")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/all_stations", hostapdAllStations).Methods("GET")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/config", hostapdConfig).Methods("GET")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/config", hostapdUpdateConfig).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/setChannel", hostapdChannelSwitch).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/enable", hostapdEnableInterface).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/disable", hostapdDisableInterface).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/resetConfiguration", hostapdResetInterface).Methods("PUT")
	external_router_authenticated.HandleFunc("/interfacesConfiguration", getInterfacesConfiguration).Methods("GET")
	external_router_authenticated.HandleFunc("/hostapd/restart", restartWifi).Methods("PUT")

	//ip information
	external_router_authenticated.HandleFunc("/ip/addr", ipAddr).Methods("GET")
	external_router_authenticated.HandleFunc("/ip/link/{interface}/{state}", ipLinkUpDown).Methods("PUT")

	//iw list
	external_router_authenticated.HandleFunc("/iw/{command:.*}", iwCommand).Methods("GET")

	//logs
	external_router_authenticated.HandleFunc("/logs", getLogs).Methods("GET")

	//plugins
	external_router_authenticated.HandleFunc("/plugins", getPlugins).Methods("GET")
	external_router_authenticated.HandleFunc("/plugins/{name}", updatePlugins(external_router_authenticated)).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/plusToken", plusToken).Methods("GET", "PUT")
	external_router_authenticated.HandleFunc("/stopPlusExtension", stopPlusExt).Methods("PUT")
	external_router_authenticated.HandleFunc("/startPlusExtension", startPlusExt).Methods("PUT")

	// tokens api
	external_router_authenticated.HandleFunc("/tokens", getAuthTokens).Methods("GET")
	external_router_authenticated.HandleFunc("/tokens", updateAuthTokens).Methods("PUT", "DELETE")

	external_router_authenticated.HandleFunc("/speedtest/{start:[0-9]+}-{end:[0-9]+}", speedTest).Methods("GET", "PUT", "OPTIONS")

	// notifications
	external_router_authenticated.HandleFunc("/notifications", getNotificationSettings).Methods("GET")
	external_router_authenticated.HandleFunc("/notifications", modifyNotificationSettings).Methods("DELETE", "PUT")
	external_router_authenticated.HandleFunc("/notifications/{index:[0-9]+}", modifyNotificationSettings).Methods("DELETE", "PUT")

	// PSK management for stations
	unix_wifid_router.HandleFunc("/reportPSKAuthFailure", reportPSKAuthFailure).Methods("PUT")
	unix_wifid_router.HandleFunc("/reportPSKAuthSuccess", reportPSKAuthSuccess).Methods("PUT")
	unix_wifid_router.HandleFunc("/interfaces", getEnabledAPInterfaces).Methods("GET")

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

	// 1. Wireguard may be disabled and the path might not exist,
	// 2. The container has not started yet for the first time
	// -> Make the directory path regardless
	_ = os.MkdirAll(UNIX_WIREGUARD_LISTENER_PATH, 0664)
	os.Remove(UNIX_WIREGUARD_LISTENER)
	unixWireguardListener, err := net.Listen("unix", UNIX_WIREGUARD_LISTENER)
	if err != nil {
		panic(err)
	}

	PluginRoutes(external_router_authenticated)

	wifidServer := http.Server{Handler: logRequest(unix_wifid_router)}
	dhcpdServer := http.Server{Handler: logRequest(unix_dhcpd_router)}
	wireguardServer := http.Server{Handler: logRequest(unix_wireguard_router)}

	headersOk := handlers.AllowedHeaders([]string{"X-Requested-With", "Content-Type", "Authorization", "SPR-Bearer"})
	originsOk := handlers.AllowedOrigins([]string{"*"})
	methodsOk := handlers.AllowedMethods([]string{"GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"})

	//initialize hostap  related items
	initRadios()
	//initialize user firewall rules
	initUserFirewallRules()
	//start the websocket handler
	WSRunNotify()
	// collect traffic accounting statistics
	trafficTimer()
	// start the event handler
	go NotificationsRunEventListener()

	sslPort, runSSL := os.LookupEnv("API_SSL_PORT")

	if runSSL {
		listenPort, err := strconv.Atoi(sslPort)
		if err != nil {
			listenPort = 443
		}

		listenAddr := fmt.Sprint("0.0.0.0:", listenPort)

		go http.ListenAndServeTLS(listenAddr, ApiTlsCert, ApiTlsKey, logRequest(handlers.CORS(originsOk, headersOk, methodsOk)(auth.Authenticate(external_router_authenticated, external_router_public, external_router_setup))))
	}

	go http.ListenAndServe("0.0.0.0:80", logRequest(handlers.CORS(originsOk, headersOk, methodsOk)(auth.Authenticate(external_router_authenticated, external_router_public, external_router_setup))))

	go wifidServer.Serve(unixWifidListener)

	go dhcpdServer.Serve(unixDhcpdListener)

	wireguardServer.Serve(unixWireguardListener)
}
