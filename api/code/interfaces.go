/*
Routines for managing the interfaces
*/
package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
)

import "github.com/gorilla/mux"

var gAPIInterfacesPath = TEST_PREFIX + "/configs/base/interfaces.json"
var gAPIInterfacesPublicPath = TEST_PREFIX + "/state/public/interfaces.json"

type InterfaceConfig struct {
	Name        string
	Type        string
	Subtype     string
	Enabled     bool
	ExtraBSS    []ExtraBSS `json:",omitempty"`
	DisableDHCP bool       `json:",omitempty"`
	IP          string     `json:",omitempty"`
	Router      string     `json:",omitempty"`
	VLAN        string     `json:",omitempty"`
}

// this will be exported to all containers in public/interfaces.json
type PublicInterfaceConfig struct {
	Name    string
	Type    string
	Subtype string
	Enabled bool
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
	ioutil.WriteFile(gAPIInterfacesPublicPath, file, 0660)
	Interfacesmtx.Unlock()
}

func resetInterface(interfaces []InterfaceConfig, name string, prev_type string, prev_subtype string, enabled bool) {
	//NOTE: must run *after* write  has happened
	// as gateway code depends on an updated interfaces list.

	if prev_type == "" {
		//nothing to do
		return
	}

	// IMPORTANT, now the previous subtype / type needs to be updated
	if prev_type == "Uplink" {

		removeUplinkEntry(name)

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

func configureInterface(interfaceType string, subType string, name string) error {
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

			err = ioutil.WriteFile(path, []byte(configData), 0644)
			if err != nil {
				fmt.Println("Error creating", path)
				return err
			}

		}

	}

	newEntry := InterfaceConfig{name, interfaceType, subType, true, []ExtraBSS{}, false, "", "", ""}

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
		resetInterface(config, name, prev_type, prev_subtype, false)
	}

	if interfaceType == "Uplink" {
		addUplinkEntry(name, subType)
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
		resetInterface(config, config[i].Name, config[i].Type, config[i].Subtype, enabled)

		if config[i].Type == "Uplink" && enabled {
			addUplinkEntry(config[i].Name, config[i].Subtype)
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
			resetInterface(interfaces, Iface, prev_type, prev_subtype, Enabled)

			if Type == "Uplink" && Enabled {
				addUplinkEntry(Iface, Subtype)
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
			//set IP address directly

			//add route

			//TBD: handle vlan
		}
	}

	return nil
}

func updateInterfaceConfig(iconfig InterfaceConfig) error {
	//asumes iconfig has been sanitized

	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()
	interfaces := loadInterfacesConfigLocked()

	found := false
	changed := false

	prev_type := ""
	prev_subtype := ""
	prev_enabled := false

	for i, iface := range interfaces {
		if iface.Name == iconfig.Name {
			found = true
			if interfaces[i].Enabled != iconfig.Enabled ||
				interfaces[i].Type != iconfig.Type {
				prev_type = iconfig.Type
				prev_subtype = iconfig.Subtype
				prev_enabled = iconfig.Enabled
				changed = true
				interfaces[i].Enabled = iconfig.Enabled
				interfaces[i].Type = iconfig.Type

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

		//reset with previous settings
		resetInterface(interfaces, iconfig.Name, prev_type, prev_subtype, prev_enabled)

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
	err = ioutil.WriteFile(gAPIInterfacesPath, file, 0660)
	if err != nil {
		return err
	}

	public := loadInterfacesPublicConfigLocked()
	file, err = json.MarshalIndent(public, "", " ")
	if err != nil {
		return err
	}

	//write a copy to the public path
	return ioutil.WriteFile(gAPIInterfacesPublicPath, file, 0660)
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

	//AP has a separate path for configuration
	if iconfig.Type == "AP" {
		http.Error(w, "Set interface in AP mode using hostapd API instead", 400)
		return
	}

	if iconfig.Subtype != "" {
		http.Error(w, "Settting subtype not supported", 400)
		return
	}

	i := InterfaceConfig{}
	i.Name = iconfig.Name
	i.Type = iconfig.Type
	i.Enabled = iconfig.Enabled

	err = updateInterfaceConfig(i)
	if err != nil {
		log.Println(err)
		http.Error(w, err.Error(), 400)
		return
	}
}
