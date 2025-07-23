/*
Routines for managing the interfaces
*/
package main

import (
	"bufio"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"golang.org/x/net/icmp"
	"golang.org/x/net/ipv4"
	"io/ioutil"
	"math/big"
	"net"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"
)

import "github.com/gorilla/mux"

var Interfacesmtx sync.Mutex

var gAPIInterfacesPath = TEST_PREFIX + "/configs/base/interfaces.json"
var gAPIInterfacesPublicPath = TEST_PREFIX + "/state/public/interfaces.json"

type InterfaceConfig struct {
	Name                     string
	Type                     string
	Subtype                  string
	Enabled                  bool
	ExtraBSS                 []ExtraBSS `json:",omitempty"`
	DisableDHCP              bool       `json:",omitempty"`
	IP                       string     `json:",omitempty"`
	Router                   string     `json:",omitempty"`
	VLAN                     string     `json:",omitempty"`
	MACOverride              string     `json:",omitempty"`
	MACRandomize             bool       `json:",omitempty"`
	MACCloak                 bool       `json:",omitempty"`
	CaptivePortalPassthrough bool       `json:",omitempty"`
	CaptivePortalDomains     []string   `json:",omitempty"`
}

// this will be exported to all containers in public/interfaces.json
type PublicInterfaceConfig struct {
	Name         string
	Type         string
	Subtype      string
	Enabled      bool
	MACOverride  string `json:",omitempty"`
	MACRandomize bool   `json:",omitempty"`
	MACCloak     bool   `json:",omitempty"`
}

func isValidMAC(MAC string) bool {
	if MAC == "" {
		return false
	}
	var validMacAddress = regexp.MustCompile(`^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$`).MatchString
	return validMacAddress(MAC)
}

func isValidIface(Iface string) bool {
	if Iface == "" {
		return false
	}
	var validInterface = regexp.MustCompile(`^[a-zA-Z0-9-]*(\.[a-zA-Z0-9-]*)*$`).MatchString
	return validInterface(Iface)
}

func isValidIfaceType(t string) bool {
	validTypes := []string{"AP", "Uplink", "Downlink", "Other"}
	for _, validType := range validTypes {
		if t == validType {
			return true
		}
	}
	return false
}

func loadInterfacesConfigLocked() []InterfaceConfig {
	//read the old configuration
	data, err := os.ReadFile(gAPIInterfacesPath)
	config := []InterfaceConfig{}
	if err == nil {
		_ = json.Unmarshal(data, &config)
	}

	return config
}

func loadInterfacesPublicConfigLocked() []PublicInterfaceConfig {
	//read the old configuration
	data, err := os.ReadFile(gAPIInterfacesPath)
	config := []PublicInterfaceConfig{}
	if err == nil {
		_ = json.Unmarshal(data, &config)
	}
	return config
}

func isAPVlan(Iface string) bool {
	Interfacesmtx.Lock()
	//read the old configuration
	config := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()

	for _, entry := range config {
		if entry.Enabled && entry.Type == "AP" {
			if strings.Contains(Iface, entry.Name+".") {
				return true
			}
		}
	}

	return false
}

func copyInterfacesConfigToPublic() {
	Interfacesmtx.Lock()
	config := loadInterfacesPublicConfigLocked()
	file, _ := json.MarshalIndent(config, "", " ")
	ioutil.WriteFile(gAPIInterfacesPublicPath, file, 0600)
	Interfacesmtx.Unlock()
}

func resetInterface(interfaces []InterfaceConfig, name string, prev_type string, prev_subtype string, enabled bool, reset_address bool) {
	//NOTE: must run *after* write  has happened
	// as gateway code depends on an updated interfaces list.

	if reset_address {
		exec.Command("ip", "link", "set", "dev", name, "down").Run()
		err := exec.Command("macchanger", "-p", name).Run()
		exec.Command("ip", "link", "set", "dev", name, "up").Run()
		if err != nil {
			log.Println("Failed to restore mac address "+name, err)
		}
	}

	if prev_type == "" {
		//nothing to do
		return
	}

	// IMPORTANT, now the previous subtype / type needs to be updated
	if prev_type == "Uplink" {

		removeUplinkEntry(name, true)

		if prev_subtype == "wifi" {
			//wifi was disabled, notify it
			insertWpaConfigAndSave(interfaces, WPAIface{})
			restartPlugin("WIFIUPLINK")
		} else if prev_subtype == "pppup" {
			//ppp was disabled, notify it
			insertPPPConfigAndSave(interfaces, PPPIface{})
			restartPlugin("PPP")
		}
	} else if prev_type == "AP" {
		//previously was an AP. getEnabledAPInterfaces() will no longer return this
		// Iface, but wifid needs to be restarted
		callSuperdRestart("", "wifid")
	}

}

func configureInterface(interfaceType string, subType string, name string, MACRandomize bool, MACCloak bool) error {
	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()

	if !isValidIface(name) {
		return fmt.Errorf("Invalid interace name " + name)
	}

	if interfaceType != "AP" && interfaceType != "Uplink" {
		//generate a hostap config if it is not there yet (?)
		return fmt.Errorf("Unknown interface type " + interfaceType)
	}

	if interfaceType == "AP" {
		//ensure that a hostapd configuration exists for this interface.
		path := getHostapdConfigPath(name)
		_, err := os.Stat(path)
		if os.IsNotExist(err) {

			//copy the template over
			input, err := ioutil.ReadFile(getHostapdConfigPath("template"))
			if err != nil {
				fmt.Println("missing template configuration")
				createHostAPTemplate()
				input, err = ioutil.ReadFile(getHostapdConfigPath("template"))
				if err != nil {
					fmt.Println("failed to create tempalte")
					return err
				}
			}

			configData := string(input)
			matchSSID := regexp.MustCompile(`(?m)^(ssid)=(.*)`)
			matchInterfaceAP := regexp.MustCompile(`(?m)^(interface)=(.*)`)
			matchControl := regexp.MustCompile(`(?m)^(ctrl_interface)=(.*)`)

			configData = matchSSID.ReplaceAllString(configData, "$1="+"SPR_"+name)
			configData = matchInterfaceAP.ReplaceAllString(configData, "$1="+name)
			configData = matchControl.ReplaceAllString(configData, "$1="+"/state/wifi/control_"+name)

			err = ioutil.WriteFile(path, []byte(configData), 0600)
			if err != nil {
				fmt.Println("Error creating", path)
				return err
			}

		}

	}

	newEntry := InterfaceConfig{name, interfaceType, subType, true, []ExtraBSS{}, false, "", "", "", "", MACRandomize, MACCloak, false, []string{}}

	config := loadInterfacesConfigLocked()

	foundEntry := false
	prev_type := ""
	prev_subtype := ""
	for i, _ := range config {
		if config[i].Name == name {
			if config[i].Type != newEntry.Type || config[i].Subtype != newEntry.Subtype {
				prev_type = config[i].Type
				prev_subtype = config[i].Subtype
			}
			config[i] = newEntry
			foundEntry = true
			break
		}
	}

	if !foundEntry {
		config = append(config, newEntry)
	}

	err := writeInterfacesConfigLocked(config)
	if err != nil {
		fmt.Println("failed to write interfaces configuration file", err)
		return err
	}

	if prev_type != "" {
		resetInterface(config, name, prev_type, prev_subtype, false, false)
	}

	if interfaceType == "Uplink" {
		addUplinkEntry(name, subType, true)
	}
	//set the

	return nil
}

func toggleInterface(name string, enabled bool) error {
	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()

	//read the old configuration
	config := loadInterfacesConfigLocked()

	foundEntry := false
	madeChange := false
	i := 0

	for i, _ := range config {
		if config[i].Name == name {
			foundEntry = true
			madeChange = enabled != config[i].Enabled
			config[i].Enabled = enabled
			break
		}
	}

	if !foundEntry {
		return fmt.Errorf("interface not found")
	}

	if madeChange {
		err := writeInterfacesConfigLocked(config)
		resetInterface(config, config[i].Name, config[i].Type, config[i].Subtype, enabled, false)

		if config[i].Type == "Uplink" && enabled {
			addUplinkEntry(config[i].Name, config[i].Subtype, true)
		}

		return err
	}

	return nil
}

func getInterfacesConfiguration(w http.ResponseWriter, r *http.Request) {
	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()

	config := loadInterfacesConfigLocked()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

func updateInterfaceType(Iface string, Type string, Subtype string, Enabled bool) ([]InterfaceConfig, error) {

	if !isValidIface(Iface) {
		return []InterfaceConfig{}, fmt.Errorf("Invalid iface name " + Iface)
	}

	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()
	interfaces := loadInterfacesConfigLocked()

	found := false
	changed := false
	reset := false

	prev_type := ""
	prev_subtype := ""
	for i, iface := range interfaces {
		if iface.Name == Iface {
			found = true
			if interfaces[i].Enabled != Enabled {
				interfaces[i].Enabled = Enabled
				changed = true
			}
			if interfaces[i].Type != Type || interfaces[i].Subtype != Subtype {
				prev_type = interfaces[i].Type
				prev_subtype = interfaces[i].Subtype

				interfaces[i].Type = Type
				interfaces[i].Subtype = Subtype
				changed = true
				reset = true
				break
			}
		}
	}

	if !found {
		changed = true
		new := InterfaceConfig{}
		new.Name = Iface
		new.Type = Type
		new.Subtype = Subtype
		new.Enabled = Enabled
		interfaces = append(interfaces, new)
	}

	if changed {
		err := writeInterfacesConfigLocked(interfaces)
		if reset {
			resetInterface(interfaces, Iface, prev_type, prev_subtype, Enabled, false)

			if Type == "Uplink" && Enabled {
				addUplinkEntry(Iface, Subtype, true)
			}
		}

		return interfaces, err
	}
	return interfaces, nil
}

func updateInterfaceIP(iconfig InterfaceConfig) error {
	//assumes iconfig has been sanitized
	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()
	interfaces := loadInterfacesConfigLocked()

	found := false
	changed := false

	for i, iface := range interfaces {
		if iface.Name == iconfig.Name {
			found = true
			if interfaces[i].Enabled != iconfig.Enabled ||
				interfaces[i].DisableDHCP != iconfig.DisableDHCP ||
				interfaces[i].IP != iconfig.IP ||
				interfaces[i].VLAN != iconfig.VLAN ||
				interfaces[i].Router != iconfig.Router {
				changed = true
				interfaces[i].Enabled = iconfig.Enabled
				interfaces[i].DisableDHCP = iconfig.DisableDHCP
				interfaces[i].IP = iconfig.IP
				interfaces[i].Router = iconfig.Router
				interfaces[i].VLAN = iconfig.VLAN
			}
		}
	}

	if !found {
		return fmt.Errorf("interface not found")
	} else if changed {
		return writeInterfacesConfigLocked(interfaces)
	}

	if iconfig.Enabled {
		if iconfig.DisableDHCP == true && iconfig.IP != "" {
			//TBd. Note, DHCP client observes these.

			/*
							# Handle static IP assignments
				jq -r '.[] | select(.Type == "Uplink" and .Enabled and .DisableDHCP == true) | "\(.Name) \(.IP) \(.Router)"' $JSON |
				while IFS= read -r entry; do
						read -r name ip router <<< "$entry"
						echo "Set $name with address $ip route $router"
						# Assign IP address and router.
						ip addr flush dev $name
						ip addr add $ip dev $name
						ip route add 0.0.0.0/0 via $router dev $name
				done
			*/
			//set IP address directly

			//add route

			//TBD: handle vlan
		}
	}

	return nil
}

func updateInterfaceConfig(iconfig InterfaceConfig) error {
	//assumes iconfig has been sanitized

	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()
	interfaces := loadInterfacesConfigLocked()

	found := false
	changed := false

	prev_type := ""
	prev_subtype := ""
	prev_enabled := false
	reset_random := false

	for i, iface := range interfaces {
		if iface.Name == iconfig.Name {
			found = true
			if interfaces[i].Enabled != iconfig.Enabled ||
				interfaces[i].Type != iconfig.Type ||
				interfaces[i].MACRandomize != iconfig.MACRandomize ||
				interfaces[i].MACCloak != iconfig.MACCloak ||
				interfaces[i].MACOverride != iconfig.MACOverride {
				prev_type = interfaces[i].Type
				prev_subtype = interfaces[i].Subtype
				prev_enabled = interfaces[i].Enabled
				if interfaces[i].MACRandomize == true && iconfig.MACRandomize == false {
					reset_random = true
				}
				changed = true
				interfaces[i].Enabled = iconfig.Enabled
				interfaces[i].Type = iconfig.Type
				interfaces[i].MACOverride = iconfig.MACOverride
				interfaces[i].MACRandomize = iconfig.MACRandomize
				interfaces[i].MACCloak = iconfig.MACCloak
			}
			break
		}
	}

	if !found {
		interfaces = append(interfaces, iconfig)
		changed = true
	}

	if changed {
		err := writeInterfacesConfigLocked(interfaces)

		restart_wifid := refreshInterfaceOverridesLocked()

		//reset with previous settings
		resetInterface(interfaces, iconfig.Name, prev_type, prev_subtype, prev_enabled, reset_random)

		//set uplink
		if iconfig.Type == "Uplink" {
			addUplinkEntry(iconfig.Name, iconfig.Subtype, true)
		}

		if restart_wifid || (prev_type != "AP" && iconfig.Type == "AP") {
			//restart wifid
			callSuperdRestart("", "wifid")
		}

		refreshDownlinksLocked()
		return err
	}

	return nil
}

func writeInterfacesConfigLocked(config []InterfaceConfig) error {
	file, err := json.MarshalIndent(config, "", " ")
	if err != nil {
		return err
	}
	err = ioutil.WriteFile(gAPIInterfacesPath, file, 0600)
	if err != nil {
		return err
	}

	public := loadInterfacesPublicConfigLocked()
	file, err = json.MarshalIndent(public, "", " ")
	if err != nil {
		return err
	}

	//write a copy to the public path
	return ioutil.WriteFile(gAPIInterfacesPublicPath, file, 0600)
}

/* VLAN Trunking Support */
func updateLinkVlanTrunk(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	state := mux.Vars(r)["state"]

	if state != "enable" && state != "disable" {
		http.Error(w, "state must be `enable` or `disable`", 400)
		return
	}

	if !isValidIface(iface) {
		http.Error(w, "Invalid iface name", 400)
		return
	}

	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()
	interfaces := loadInterfacesConfigLocked()

	found := false
	changed := false

	for i, ifconfig := range interfaces {
		if ifconfig.Name == iface {
			found = true
			if ifconfig.Type == "AP" || ifconfig.Type == "Uplink" {
				http.Error(w, "Iface has wrong type for vlan trunk", 400)
				return
			}

			if state == "enable" {
				interfaces[i].Subtype = "VLAN-Trunk"
				interfaces[i].Enabled = true
			} else {
				interfaces[i].Subtype = ""
			}
			changed = true
		}
	}

	if !found {
		if state == "enable" {
			ifconfig := InterfaceConfig{}
			ifconfig.Name = iface
			ifconfig.Type = "Downlink"
			ifconfig.Subtype = "VLAN-Trunk"
			ifconfig.Enabled = true
			interfaces = append(interfaces, ifconfig)
			changed = true
		} else {
			http.Error(w, "Iface not found", 400)
			return
		}
	}

	if changed {
		err := writeInterfacesConfigLocked(interfaces)
		if err != nil {
			log.Println(err)
			http.Error(w, err.Error(), 400)
			return
		}

		refreshVlanTrunk(iface, state == "enable")
	}

}

func getVLANInterfaces(parent string) ([]net.Interface, error) {
	var vlanInterfaces []net.Interface

	allInterfaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	for _, iface := range allInterfaces {
		if strings.HasPrefix(iface.Name, parent+".") {
			vlanInterfaces = append(vlanInterfaces, iface)
		}
	}

	return vlanInterfaces, nil
}

func addApiInterface(iface string) {
	exec.Command("nft", "add", "element", "inet", "filter", "api_interfaces", "{", iface, "}").Run()
}

func deleteApiInterface(iface string) {
	exec.Command("nft", "add", "element", "inet", "filter", "api_interfaces", "{", iface, "}").Run()
}

func addSetupInterface(iface string) {
	exec.Command("nft", "add", "element", "inet", "filter", "setup_interfaces", "{", iface, "}").Run()
}

func deleteSetupInterface(iface string) {
	exec.Command("nft", "add", "element", "inet", "filter", "setup_interfaces", "{", iface, "}").Run()
}

func addLanInterface(iface string) {
	exec.Command("nft", "add", "element", "inet", "filter", "lan_interfaces", "{", iface, "}").Run()
	exec.Command("nft", "add", "element", "inet", "nat", "lan_interfaces", "{", iface, "}").Run()
}

func addWiredLanInterface(iface string) {
	exec.Command("nft", "add", "element", "inet", "filter", "wired_lan_interfaces", "{", iface, "}").Run()
}

func deleteLanInterface(iface string) {
	exec.Command("nft", "delete", "element", "inet", "filter", "lan_interfaces", "{", iface, "}").Run()
	exec.Command("nft", "delete", "element", "inet", "nat", "lan_interfaces", "{", iface, "}").Run()
}

func refreshVlanTrunk(iface string, enable bool) {
	//first clear any vlan interfaces that already exist
	ifaces, err := getVLANInterfaces(iface)
	if err != nil {
		log.Println("failed to enumerate iface "+iface, err)
		return
	}

	for _, iface := range ifaces {
		cmd := exec.Command("ip", "link", "del", iface.Name)
		_, err := cmd.Output()

		if err != nil {
			log.Println("ip link del failed for "+iface.Name, err)
			return
		}

		deleteLanInterface(iface.Name)
	}

	//future: also reset all vlans from dhcp_access.

	if !enable {
		//all done
		return
	}

	//next create vlans
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	devices := getDevicesJson()
	for _, dev := range devices {
		if dev.VLANTag != "" {
			//create interface
			vlanIface := iface + "." + dev.VLANTag

			cmd := exec.Command("ip", "link", "add", "link", iface,
				"name", vlanIface, "type", "vlan", "id", dev.VLANTag)
			_, err := cmd.Output()

			if err != nil {
				log.Println("ip link add link vlan failed", cmd, err)
				continue
			}

			cmd = exec.Command("ip", "link", "set", vlanIface, "up")
			_, err = cmd.Output()
			if err != nil {
				log.Println("ip link set up vlan failed", cmd, err)
				continue
			}

			addLanInterface(vlanIface)
			// add vlan to dhcp_access
			exec.Command("nft", "add", "element", "inet", "filter", "dhcp_access", "{", vlanIface, ".", dev.MAC, ":", "accept", "}").Run()
		}
	}
}

// expects to hold interfacesmtx, devicesmtx
func refreshVLANTrunks() {
	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()
	interfaces := loadInterfacesConfigLocked()

	for _, ifconfig := range interfaces {
		if ifconfig.Type == "AP" || ifconfig.Type == "Uplink" {
			continue
		}

		if ifconfig.Subtype == "VLAN-Trunk" {
			refreshVlanTrunk(ifconfig.Name, true)
		} else {
			refreshVlanTrunk(ifconfig.Name, false)
		}
	}

}

var rand_oui_prefixes []string

func load_rand_oui_prefixes() {
	file, err := os.Open(TEST_PREFIX + "/scripts/rand_oui_prefixes")
	if err != nil {
		fmt.Println("Error opening file:", err)
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		rand_oui_prefixes = append(rand_oui_prefixes, scanner.Text())
	}

	if err := scanner.Err(); err != nil {
		fmt.Println("Error reading file:", err)
		return
	}
}

func generateRandomMAC(cloak bool) string {
	if cloak {
		if len(rand_oui_prefixes) == 0 {
			load_rand_oui_prefixes()
		}

		if len(rand_oui_prefixes) != 0 {
			nBig, err := rand.Int(rand.Reader, big.NewInt(int64(len(rand_oui_prefixes)-1)))
			if err == nil {
				randomPrefix := rand_oui_prefixes[nBig.Int64()]

				hexDigits := "0123456789ABCDEF"
				macAddress := strings.Join([]string{
					randomPrefix[:2],
					randomPrefix[2:4],
					randomPrefix[4:],
				}, ":") + ":"

				for i := 0; i < 3; i++ {
					octet := make([]byte, 1)
					rand.Read(octet)
					macAddress += string(hexDigits[octet[0]>>4])
					macAddress += string(hexDigits[octet[0]&0x0f])
					if i < 2 {
						macAddress += ":"
					}
				}

				return macAddress
			}
		}

		//fall thru if no prefixes available.
	}

	hexDigits := "0123456789ABCDEF"
	macAddress := ""
	firstOctet := make([]byte, 1)
	rand.Read(firstOctet)
	//unicast, LAA address
	firstOctet[0] = (firstOctet[0] & 0xfe) | 0x02
	macAddress += string(hexDigits[firstOctet[0]>>4])
	macAddress += string(hexDigits[firstOctet[0]&0x0f])
	macAddress += ":"

	for i := 0; i < 5; i++ {
		octet := make([]byte, 1)
		rand.Read(octet)
		macAddress += string(hexDigits[octet[0]>>4])
		macAddress += string(hexDigits[octet[0]&0x0f])
		if i < 4 {
			macAddress += ":"
		}
	}

	return macAddress
}

func refreshInterfaceOverrides() {
	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()

	restart_wifid := refreshInterfaceOverridesLocked()

	// when setting an override the interface could have been brought down
	//which can kill the route
	rebuildUplink()

	//restart hostap if the mac has changed
	if restart_wifid {
		callSuperdRestart("", "wifid")
	}
}

func refreshInterfaceOverridesLocked() bool {
	do_restart_wifid := false
	interfaces := loadInterfacesConfigLocked()
	for _, ifconfig := range interfaces {
		if ifconfig.MACRandomize == true {
			target := generateRandomMAC(ifconfig.MACCloak)
			exec.Command("ip", "link", "set", "dev", ifconfig.Name, "down").Run()
			err := exec.Command("ip", "link", "set", "dev", ifconfig.Name, "address", target).Run()
			exec.Command("ip", "link", "set", "dev", ifconfig.Name, "up").Run()
			if err != nil {
				log.Println("Failed to set random address "+target, err)
			}

			//unfortunately hostapd wants the macs assigned in-config,
			// so we need to go through with updating that
			if ifconfig.Type == "AP" {
				UpdateHostapMACs(ifconfig.Name, target)
				do_restart_wifid = true
			}
		} else if ifconfig.MACOverride != "" {
			exec.Command("ip", "link", "set", "dev", ifconfig.Name, "down").Run()
			err := exec.Command("ip", "link", "set", "dev", ifconfig.Name, "address", ifconfig.MACOverride).Run()
			exec.Command("ip", "link", "set", "dev", ifconfig.Name, "up").Run()
			if err != nil {
				log.Println("Failed to set address "+ifconfig.MACOverride, err)
			}
			if ifconfig.Type == "AP" {
				UpdateHostapMACs(ifconfig.Name, ifconfig.MACOverride)
				do_restart_wifid = true
			}
		}
	}
	return do_restart_wifid
}

func refreshDownlinks() {
	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()

	refreshDownlinksLocked()
}

func refreshDownlinksLocked() {
	interfaces := loadInterfacesConfigLocked()

	//empty the wired lan interfaces list
	exec.Command("nft", "flush", "set", "inet", "filter", "wired_lan_interfaces").Run()

	// and repopulate it
	lanif := os.Getenv("LANIF")
	if lanif != "" {
		addWiredLanInterface(lanif)
	}
	for _, ifconfig := range interfaces {
		if ifconfig.Type == "Downlink" {
			if lanif != "" && ifconfig.Name == lanif {
				//already covered
				continue
			}
			addWiredLanInterface(ifconfig.Name)
		}
	}
}

/* Setting basic settings */
func updateLinkConfig(w http.ResponseWriter, r *http.Request) {
	iconfig := PublicInterfaceConfig{}
	err := json.NewDecoder(r.Body).Decode(&iconfig)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if !isValidIface(iconfig.Name) {
		http.Error(w, "Invalid iface name", 400)
		return
	}

	if !isValidIfaceType(iconfig.Type) {
		http.Error(w, "Invalid type", 400)
		return
	}

	if iconfig.MACOverride != "" {
		if !isValidMAC(iconfig.MACOverride) {
			http.Error(w, "Invalid MAC Override", 400)
			return
		}
	}

	if iconfig.Subtype != "" {
		http.Error(w, "Settting subtype not supported", 400)
		return
	}

	i := InterfaceConfig{}
	i.Name = iconfig.Name
	i.Type = iconfig.Type
	i.Enabled = iconfig.Enabled
	i.MACRandomize = iconfig.MACRandomize
	i.MACCloak = iconfig.MACCloak
	i.MACOverride = iconfig.MACOverride

	err = updateInterfaceConfig(i)
	if err != nil {
		log.Println(err)
		http.Error(w, err.Error(), 400)
		return
	}
}

func pingTest(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	address := mux.Vars(r)["address"]

	if !isValidIface(iface) {
		http.Error(w, "Invalid interface name", 400)
		return
	}

	ief, err := net.InterfaceByName(iface)
	if err != nil {
		http.Error(w, "Invalid interface", 400)
		return
	}

	ipAddr, err := net.ResolveIPAddr("ip", address)
	if err != nil {
		http.Error(w, "Invalid address", 400)
		return
	}

	result := []string{}

	for i := 0; i < 4; i++ {
		start := time.Now()

		fd, err := syscall.Socket(syscall.AF_INET, syscall.SOCK_RAW, syscall.IPPROTO_ICMP)
		if err != nil {
			http.Error(w, "Error creating raw socket: %v\n", 400)
			return
		}
		defer syscall.Close(fd)

		if err := bindToDevice(fd, ief.Name); err != nil {
			http.Error(w, "Error binding to interface", 400)
			return
		}

		f := os.NewFile(uintptr(fd), "")
		conn, err := net.FilePacketConn(f)
		if err != nil {
			http.Error(w, "Error creating ICMP connection", 400)
			return
		}
		defer conn.Close()

		err = bindToDevice(fd, ief.Name)
		if err != nil {
			http.Error(w, "Failed to listen on interface", 400)
			return
		}

		msg := icmp.Message{
			Type: ipv4.ICMPTypeEcho,
			Code: 0,
			Body: &icmp.Echo{
				ID:   1,
				Seq:  i,
				Data: []byte("HELLO"),
			},
		}

		msgBytes, err := msg.Marshal(nil)
		if err != nil {
			http.Error(w, "Failed to marshal ping", 400)
			return
		}

		_, err = conn.WriteTo(msgBytes, ipAddr)
		if err != nil {
			continue
		}

		err = conn.SetDeadline(time.Now().Add(time.Second * 1))
		if err != nil {
			http.Error(w, "Failed to set deadline", 400)
			return
		}

		_, _, err = conn.ReadFrom(make([]byte, 1500))
		if err != nil {
			result = append(result, "timeout")
			continue
		}

		duration := time.Since(start)
		result = append(result, duration.String())
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func udpTest(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	address := mux.Vars(r)["address"]

	if !isValidIface(iface) {
		http.Error(w, "Invalid interface name", 400)
		return
	}

	ief, err := net.InterfaceByName(iface)
	if err != nil {
		http.Error(w, "Invalid interface", 400)
		return
	}

	udpAddr, err := net.ResolveUDPAddr("udp", address)
	if err != nil {
		http.Error(w, "Invalid address", 400)
		return
	}

	result := []string{}

	for i := 0; i < 4; i++ {
		start := time.Now()

		addrs, err := ief.Addrs()
		if err != nil {
			http.Error(w, "Failed to get interface addresses", 400)
			return
		}

		var conn *net.UDPConn
		for _, addr := range addrs {
			if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
				conn, err = net.ListenUDP("udp", &net.UDPAddr{IP: ipNet.IP})
				if err == nil {
					break
				}
			}
		}
		if conn == nil {
			http.Error(w, "Failed to listen on interface", 400)
			return
		}
		defer conn.Close()

		message := []byte("ping")
		_, err = conn.WriteTo(message, udpAddr)
		if err != nil {
			continue
		}

		err = conn.SetDeadline(time.Now().Add(time.Second * 1))
		if err != nil {
			http.Error(w, "Failed to set deadline", 400)
			return
		}

		buffer := make([]byte, 1500)
		_, _, err = conn.ReadFrom(buffer)
		if err != nil {
			result = append(result, "timeout")
			continue
		}

		duration := time.Since(start)
		result = append(result, duration.String())
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func getRandomizeBSSIDState(iface string) (bool, bool) {
	rMAC := false
	cMAC := false

	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()

	//read the old configuration
	config := loadInterfacesConfigLocked()

	for _, entry := range config {
		if entry.Name == iface {
			return entry.MACRandomize, entry.MACCloak
		}
	}

	return rMAC, cMAC
}
