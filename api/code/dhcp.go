/*
CoreDHCP runs the low level DHCP protocol

# The API generates and manages IP address space

CoreDHCP's tiny_subnets plugins makes upcalls via a unix socket
into these APIs

wireguardUpdate has also been placed into here since it has to do with device
IP management
*/
package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

var gDHCPConfigPath = TEST_PREFIX + "/configs/base/dhcp.json"
var gLANIPPath = TEST_PREFIX + "/configs/base/lanip"
var gDhcpConfig = DHCPConfig{}

type DHCPConfig struct {
	//subnet pool
	TinyNets  []string
	LeaseTime string

	//do we want to maintain client mappings here now? -> lookup into devices and back
	//devices has RecentIP.

	// additional dhcp options?
}

type DHCPRequest struct {
	MAC        string
	Identifier string
	Name       string
	Iface      string
}

// this supports wireguard
type AbstractDHCPRequest struct {
	Identifier string
}

type DHCPResponse struct {
	Identifier string
	IP         string
	RouterIP   string
	DNSIP      string
	LeaseTime  string
}

type DHCPFail struct {
	MAC        string
	Identifier string
	Name       string
	Iface      string
	Reason     string
}

var DHCPmtx sync.Mutex

func SUBNETP1(subnet string) string {
	_, ipnet, err := net.ParseCIDR(subnet)
	if err != nil {
		log.Println("failed to parse subnet ip", err)
		return os.Getenv("LANIP")
	}

	return TinyIpDelta(ipnet.IP.String(), 1)
}

func getLANIP() string {
	//this function assumes that the dhcp config lock is held

	if len(gDhcpConfig.TinyNets) == 0 {
		//best effort
		return os.Getenv("LANIP")
	}

	//calculate from the first IP in the first subnet
	return SUBNETP1(gDhcpConfig.TinyNets[0])
}

func updateLanIPs(TinyNets []string) {

	lanif := "sprloop"

	cmd := exec.Command("ip", "addr", "flush", "dev", lanif)
	_, err := cmd.Output()
	if err != nil {
		log.Println("failed to flush", lanif)
		//try adding the dummy loop just in case
		_, err = exec.Command("ip", "link", "add", "name", lanif, "type", "dummy").Output()
		if err != nil {
			log.Println("failed to make dummyif", err)
			return
		}
	}

	for _, subnet := range TinyNets {
		parts := strings.Split(subnet, "/")
		if len(parts) != 2 {
			log.Println("invalid subnet", parts)
			continue
		}
		mask := parts[1]
		lanip := SUBNETP1(subnet)
		_, err = exec.Command("ip", "addr", "add", lanip+"/"+mask, "dev", lanif).Output()
		if err != nil {
			log.Println("failed to add subnet to interface", lanip, mask)
		}
	}

	_, err = exec.Command("ip", "link", "set", "dev", lanif, "up").Output()
	if err != nil {
		log.Println("failed to set link up for", lanif)
		return
	}
}

func initDHCP() {
	DHCPmtx.Lock()
	defer DHCPmtx.Unlock()
	loadDHCPConfig()
}

func migrateDHCP() {
	//start the config with some defaults
	lanip := os.Getenv("LANIP")
	if lanip == "" {
		lanip = "192.168.2.1"
	}
	tiny_net := TinyIpDelta(lanip, -1) + "/24"

	gDhcpConfig.TinyNets = []string{tiny_net}
	gDhcpConfig.LeaseTime = "24h0m0s"

	saveDHCPConfig()
}

func loadDHCPConfig() {
	data, err := ioutil.ReadFile(gDHCPConfigPath)
	if err != nil {
		log.Println(err)

		//use LANIP to establish the DHCP configuration
		migrateDHCP()
	} else {
		err = json.Unmarshal(data, &gDhcpConfig)
		if err != nil {
			log.Println(err)
			return
		}
	}
	updateFirewallSubnets(getLANIP(), gDhcpConfig.TinyNets)
	updateLanIPs(gDhcpConfig.TinyNets)
}

func loadWithLockingDHCPConfig() DHCPConfig {
	DHCPmtx.Lock()
	loadDHCPConfig()
	tmp := gDhcpConfig
	DHCPmtx.Unlock()
	return tmp
}

func saveDHCPConfig() {
	file, _ := json.MarshalIndent(gDhcpConfig, "", " ")
	err := ioutil.WriteFile(gDHCPConfigPath, file, 0600)
	if err != nil {
		log.Fatal(err)
	}

	lanIP := getLANIP()

	err = ioutil.WriteFile(gLANIPPath, []byte(lanIP), 0600)
	if err != nil {
		log.Fatal(err)
	}

	updateFirewallSubnets(lanIP, gDhcpConfig.TinyNets)
	updateLanIPs(gDhcpConfig.TinyNets)
}

func getSetDhcpConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	DHCPmtx.Lock()
	defer DHCPmtx.Unlock()

	if r.Method == http.MethodGet {
		//reload it from disk before returning it
		loadDHCPConfig()

		json.NewEncoder(w).Encode(gDhcpConfig)
		return
	}

	conf := DHCPConfig{}
	err := json.NewDecoder(r.Body).Decode(&conf)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	//validate tinynets
	subnetRegex := regexp.MustCompile(`^((?:\d{1,2}|1\d{2}|2[0-4]\d|25[0-5])\.){3}(?:\d{1,2}|1\d{2}|2[0-4]\d|25[0-5])(?:\/(?:[1-9]|[1-2]\d|3[0-2]))$`)

	if len(conf.TinyNets) != 0 {
		for _, subnet := range conf.TinyNets {
			if !subnetRegex.MatchString(subnet) {
				http.Error(w, "Invalid subnet in TinyNets", 400)
				return
			}
			// Extract prefix length from subnet
			prefixStr := subnet[strings.IndexByte(subnet, '/')+1:]
			prefix, err := strconv.Atoi(prefixStr)
			if err != nil {
				http.Error(w, "Invalid prefix length for TinyNets", 400)
				return
			}

			if prefix < 8 || prefix > 24 {
				http.Error(w, "Invalid prefix length for TinyNets: "+fmt.Sprint(prefix), 400)
				return
			}
		}
	} else {
		http.Error(w, "Need at least one subnet", 400)
		return
	}

	//reuse the existing lease time if not set
	if conf.LeaseTime == "" {
		conf.LeaseTime = gDhcpConfig.LeaseTime
	} else {
		timeRegex := regexp.MustCompile(`^(\d{1,2})h(\d{1,2})m(\d{1,2})s$`)
		if !timeRegex.MatchString(conf.LeaseTime) {
			http.Error(w, "Invalid lease time", 400)
			return
		}
	}

	gDhcpConfig = conf
	saveDHCPConfig()

	json.NewEncoder(w).Encode(conf)
}

func normalizeName(Name string) string {
	re := regexp.MustCompile("[^a-zA-Z0-9]")
	return trimLower(re.ReplaceAllString(Name, "-"))
}

var SetupDHCPIPv4 = map[string]string{}
var SetupAP = "wlan0"

func getSetupIP(MAC string) (string, string) {
	IP, exists := SetupDHCPIPv4[MAC]
	if exists {
		Router := RouterFromTinyIP(IP)
		return IP, Router
	}
	return "", ""
}

func add_setup_peer(MAC string, IP string, Router string) {
	SetupDHCPIPv4[MAC] = IP

	//ensure setup ap is a valid interface for input ports.
	addSetupInterface(SetupAP)
	//likewise it should not be a lan interface
	deleteLanInterface(SetupAP)

	//add  route to device
	updateAddr(Router, SetupAP)
}

func handleDHCPResult(MAC string, IP string, Router string, Name string, Iface string) {

	//edge case -> setup mode over SetupAP
	if isSetupMode() && Iface == SetupAP {
		// dont save to devices during setup mode
		//but do update the DHCP list via SetupDHCPIPv4
		add_setup_peer(MAC, IP, Router)
		return
	}

	devices := getDevicesJson()
	val, exists := devices[MAC]

	//wireguard integration: smoothly handle a wireguard device
	//  gaining a MAC for the first time
	if !exists {
		val, exists = lookupWGDevice(&devices, "", IP)
		if exists && val.MAC == "" && val.WGPubKey != "" {
			//If an entry has no MAC assigned and does have a WG Pub Key
			//assign a MAC and delete wg pubkey indexing. Will be MAC indexed now
			val.MAC = MAC
			delete(devices, val.WGPubKey)
		} else {
			//did not find a suitable entry
			exists = false
		}
	}

	if !exists {
		//create a new device entry
		newDevice := DeviceEntry{}
		newDevice.MAC = MAC
		newDevice.RecentIP = IP
		newDevice.Groups = []string{}
		newDevice.DeviceTags = []string{}
		newDevice.DHCPFirstTime = time.Now().String()
		newDevice.DHCPLastTime = newDevice.DHCPFirstTime

		//guest ssid defaults
		if strings.Contains(Iface, ExtraBSSPrefix) {
			//guestonly policy -> can only exist on the guest AP
			newDevice.Policies = []string{"wan", "dns", "noapi", "guestonly"}
			newDevice.DeviceTags = []string{"guest"}
		}

		devices[newDevice.MAC] = newDevice
		val = newDevice
	} else {
		//update recent IP
		if val.RecentIP != IP {
			val.RecentIP = IP
			devices[MAC] = val
		}
		//udpate last DHCP Time
		val.DHCPLastTime = time.Now().String()
		devices[MAC] = val
	}

	saveDevicesJson(devices)

	notifyFirewallDHCP(val, Iface)

	if Name != "" {
		// update local mappings file for DNS
		updateLocalMappings(IP, normalizeName(val.Name))
		// and the DHCP name also
		updateLocalMappings(IP, Name)
	}
}

func dhcpRequest(w http.ResponseWriter, r *http.Request) {
	dhcp := DHCPRequest{}
	err := json.NewDecoder(r.Body).Decode(&dhcp)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	SprbusPublish("dhcp:request", dhcp)

	if dhcp.MAC == "" || dhcp.Iface == "" {
		http.Error(w, "need MAC and Iface to dhcp", 400)
		return
	}

	wanif := getWanif()
	if dhcp.Iface == wanif {
		http.Error(w, "Refuse dhcp from wanif", 400)
		return
	}

	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()

	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	DHCPmtx.Lock()
	defer DHCPmtx.Unlock()

	IP := ""
	Router := ""

	devices := getDevicesJson()
	val, exists := devices[dhcp.MAC]

	if exists {
		if strings.Contains(dhcp.Iface, ExtraBSSPrefix) {
			//ensure the device had the guestonly policy
			//this should only happen if a MAC is already known for a device
			if !slices.Contains(val.Policies, "guestonly") {
				fail := DHCPFail{}
				fail.Iface = dhcp.Iface
				fail.MAC = dhcp.MAC
				fail.Identifier = dhcp.Identifier
				fail.Name = dhcp.Name
				fail.Reason = "Missing GuestOnly Policy, Possible MAC Spoofing"
				SprbusPublish("dhcp:spoof", fail)
				http.Error(w, "Refuse dhcp from wanif", 400)
				return
			}
		}
	}

	if exists && val.RecentIP != "" && isTinyNetIPLocked(val.RecentIP) {
		IP = val.RecentIP
		Router = RouterFromTinyIP(IP)
	} else {
		if isSetupMode() {
			IP, Router = getSetupIP(dhcp.MAC)
		}
		if IP == "" {
			IP, Router = genNewDeviceIP(&devices)
		}
	}

	if IP == "" {
		log.Println("Failed to find IP address for " + dhcp.MAC)
		http.Error(w, "ip link failed", 400)
		return
	}

	LeaseTime := gDhcpConfig.LeaseTime

	handleDHCPResult(dhcp.MAC, IP, Router, dhcp.Name, dhcp.Iface)

	response := DHCPResponse{dhcp.MAC, IP, Router, getLANIP(), LeaseTime}

	SprbusPublish("dhcp:response", response)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// NOTE: this code will fail on actual big endian archs
func TwiddleTinyIP(net_ip net.IP, delta int) net.IP {
	u := binary.BigEndian.Uint32(net_ip.To4()) + uint32(delta)
	return net.IPv4(byte(u>>24), byte(u>>16), byte(u>>8), byte(u))
}

func TinyIpDelta(IP string, delta int) string {
	return TwiddleTinyIP(net.ParseIP(IP), delta).String()
}

func RouterFromTinyIP(IP string) string {
	return TwiddleTinyIP(net.ParseIP(IP), -1).String()
}

func TinyIPFromRouter(IP string) string {
	return TwiddleTinyIP(net.ParseIP(IP), 1).String()
}

func isTinyNetIP(IP string) bool {
	DHCPmtx.Lock()
	defer DHCPmtx.Unlock()
	return isTinyNetIPLocked(IP)
}

func isTinyNetIPLocked(IP string) bool {
	ip := net.ParseIP(IP)
	if ip == nil {
		return false
	}

	for _, subnetString := range gDhcpConfig.TinyNets {
		// check if theres free IPs in the range
		_, subnet, err := net.ParseCIDR(subnetString)
		if err != nil {
			log.Println("Invalid subnet "+subnetString, err)
			continue
		}

		if subnet.Contains(ip) {
			return true
		}
	}

	return false
}

func isTinyNetDeviceIP(IP string) bool {
	DHCPmtx.Lock()
	defer DHCPmtx.Unlock()
	return isTinyNetDeviceIPLocked(IP)
}

func isTinyNetDeviceIPLocked(IP string) bool {
	//check if an IP belongs not just to a subnet,
	//but that it would be a tinynet device IP
	ip := net.ParseIP(IP)
	if ip == nil {
		return false
	}

	for _, subnetString := range gDhcpConfig.TinyNets {
		// check if theres free IPs in the range
		_, subnet, err := net.ParseCIDR(subnetString)
		if err != nil {
			log.Println("Invalid subnet "+subnetString, err)
			continue
		}
		//get normalized start ip
		start_ip, _, _ := net.ParseCIDR(subnetString)

		device_ip := TwiddleTinyIP(start_ip, 2)

		for {
			if ip.String() == device_ip.String() {
				return true
			}

			device_ip = TwiddleTinyIP(device_ip, 4)
			if !subnet.Contains(device_ip) {
				//ran out of IPs in this subnet
				break
			}
		}

	}

	return false
}

func genNewDeviceIP(devices *map[string]DeviceEntry) (string, string) {
	//assumes DHCPmtx is held
	IPMap := map[string]string{}

	for _, device := range *devices {
		if device.RecentIP != "" {
			if device.MAC != "" {
				IPMap[device.RecentIP] = device.MAC
			} else {
				IPMap[device.RecentIP] = device.WGPubKey
			}
		}
	}

	if isSetupMode() {
		for mac, IP := range SetupDHCPIPv4 {
			IPMap[IP] = mac
		}
	}

	/*
	   Each tiny subnet is a /30 containing 4 addresses

	   192.168.2.0 -> route
	   192.168.2.1 -> router
	   192.168.2.2 -> device
	   192.168.2.3 -> broadcast

	   192.168.2.4 -> route
	   192.168.2.5 -> router
	   192.168.2.6 -> device
	   192.168.2.7 -> brodcast

	   MISC: /31s were found to not be supported on all devices.

	*/
	for _, subnetString := range gDhcpConfig.TinyNets {
		// check if theres free IPs in the range
		_, subnet, err := net.ParseCIDR(subnetString)
		if err != nil {
			log.Println("Invalid subnet "+subnetString, err)
			continue
		}

		//get normalied start_ip
		start_ip, _, _ := net.ParseCIDR(subnetString)

		device_ip := TwiddleTinyIP(start_ip, 2)

		for {
			//check if this IP is free
			_, exists := IPMap[device_ip.String()]
			if !exists {
				router := TwiddleTinyIP(device_ip, -1)
				return device_ip.String(), router.String()
			}

			device_ip = TwiddleTinyIP(device_ip, 4)
			if !subnet.Contains(device_ip) {
				//ran out of IPs in this subnet
				break
			}
		}
	}

	//no free IPs found

	log.Println("[-] ERROR: No more IPs left to hand out from subnets")
	return "", ""
}

// Wireguard support

// When an abstract device is added:
// request an IP address, returning a Record on success
// This allows decoupling DHCP records from MAC addresses/UDP DHCP packets.
func abstractDhcpRequest(w http.ResponseWriter, r *http.Request) {
	req := AbstractDHCPRequest{}
	err := json.NewDecoder(r.Body).Decode(&req)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if req.Identifier == "" || (strings.TrimSpace(req.Identifier) != req.Identifier) ||
		strings.Contains(req.Identifier, " ") ||
		strings.Contains(req.Identifier, "\n") {
		http.Error(w, "Invalid Identifier", 400)
		return
	}

	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()

	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	DHCPmtx.Lock()
	defer DHCPmtx.Unlock()

	devices := getDevicesJson()

	//look up the wireguard public
	val, exists := lookupWGDevice(&devices, req.Identifier, "")

	IP := ""
	Router := ""

	if exists && val.RecentIP != "" {
		IP = val.RecentIP
		Router = RouterFromTinyIP(IP)
	}

	if IP == "" {
		IP, Router = genNewDeviceIP(&devices)
	}

	response := DHCPResponse{req.Identifier, IP, Router, getLANIP(), gDhcpConfig.LeaseTime}
	//return DHCPResponse now
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

// the wireguard plugin will call for device updates

type WireguardUpdate struct {
	IP        string
	PublicKey string
	Iface     string
	Name      string
}

func wireguardUpdate(w http.ResponseWriter, r *http.Request) {
	wg := WireguardUpdate{}
	err := json.NewDecoder(r.Body).Decode(&wg)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()

	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	SprbusPublish("wg:update", wg)

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
