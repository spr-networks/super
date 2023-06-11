/*
Routines for managing the interfaces
*/
package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"regexp"
	"strings"
)

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
}

// this will be exported to all containers in public/interfaces.json
type PublicInterfaceConfig struct {
	Name    string
	Type    string
	Subtype string
	Enabled bool
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

	if prev_type == "" {
		//nothing to do
		return
	}

	// IMPORTANT, now the previous subtype / type needs to be updated
	if prev_type == "Uplink" {
		if prev_subtype == "wifi" {
			//wifi was disabled, notify it
			insertWpaConfigAndSave(interfaces, WPAIface{})
			restartPlugin("WIFI-UPLINK")
		} else if prev_subtype == "ppp" {
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

	newEntry := InterfaceConfig{name, interfaceType, subType, true, []ExtraBSS{}, false, "", ""}

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

		Interfacesmtx.Unlock()
		resetInterface(config, name, prev_type, prev_subtype, false)
		//defer will unlock
		Interfacesmtx.Lock()

	}

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
		Interfacesmtx.Unlock()
		resetInterface(config, config[i].Name, config[i].Type, config[i].Subtype, enabled)
		//locka gain for defer
		Interfacesmtx.Lock()
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

/*
update the interface type and subtype
this is fairly complex as it will

1) rewrite config for the previous type
2) return a list of plugins to reboot as a result -- for now only 1 expected

and then return the updated interface list.
*/
func updateInterfaceType(Iface string, Type string, Subtype string, Enabled bool) ([]InterfaceConfig, error) {
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
		return []InterfaceConfig{}, fmt.Errorf("interface not found")
	} else if changed {
		writeInterfacesConfigLocked(interfaces)
		if reset {
			Interfacesmtx.Unlock()
			resetInterface(interfaces, Iface, prev_type, prev_subtype, Enabled)
			//lock again for defer
			Interfacesmtx.Lock()
		}
	}

	return interfaces, nil
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
	//write a copy to the public
	return ioutil.WriteFile(gAPIInterfacesPublicPath, file, 0660)
}
