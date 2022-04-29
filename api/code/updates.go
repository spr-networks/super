package main

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"os"
)

var ZonesConfigFile = DevicesConfigPath + "zones.json"

var DeprecatedZonesConfigPath = TEST_PREFIX + "/configs/zones/zones.json"
var DeprecatedPSKConfigPath = TEST_PREFIX + "/configs/wifi/psks.json"

/* Deprecated */

type DeprecatedDeviceEntry struct {
	Name       string
	MAC        string
	WGPubKey   string
	VLANTag    string
	RecentIP   string
	PSKEntry   PSKEntry
	Zones      []string
	DeviceTags []string
}

type ZoneEntry struct {
	Name     string
	Disabled bool
	ZoneTags []string
}

type DeprecatedPSKEntry struct {
	Type    string
	Mac     string
	Psk     string
	Comment string
}

type DeprecatedClient struct {
	Mac     string
	Comment string
}

type DeprecatedClientZone struct {
	Name    string
	Clients []DeprecatedClient
}

func migrateZonesPsksV0() {
	//migrate old zone / psk files to the new format
	saveUpdate := false
	clientZones := []DeprecatedClientZone{}
	psks := map[string]DeprecatedPSKEntry{}

	devices := map[string]DeprecatedDeviceEntry{}
	newZones := []ZoneEntry{}

	data, err := ioutil.ReadFile(DeprecatedZonesConfigPath)
	if err == nil {

		err = json.Unmarshal(data, &clientZones)
		if err != nil {
			log.Fatal(err)
		}

		saveUpdate = true

		for _, entry := range clientZones {
			newZoneEntry := ZoneEntry{}
			newZoneEntry.Name = entry.Name
			newZoneEntry.ZoneTags = []string{}

			for _, client := range entry.Clients {
				client.Mac = trimLower(client.Mac)

				val, exists := devices[client.Mac]
				if !exists {
					device := DeprecatedDeviceEntry{}
					device.MAC = client.Mac
					device.Name = client.Comment
					device.DeviceTags = []string{}
					device.Zones = []string{newZoneEntry.Name}
					devices[client.Mac] = device
				} else {
					if val.Name == "" && client.Comment != "" {
						val.Name = client.Comment
					}
					val.Zones = append(val.Zones, newZoneEntry.Name)
					devices[client.Mac] = val
				}
			}

			newZones = append(newZones, newZoneEntry)
		}

	}

	data, err = ioutil.ReadFile(DeprecatedPSKConfigPath)
	if err == nil {
		err = json.Unmarshal(data, &psks)
		if err != nil {
			log.Fatal(err)
		}

		saveUpdate = true

		for _, entry := range psks {

			val, exists := devices[entry.Mac]
			if !exists {
				device := DeprecatedDeviceEntry{}
				device.MAC = entry.Mac
				device.Name = entry.Comment
				device.PSKEntry = PSKEntry{Type: entry.Type, Psk: entry.Psk}
				device.DeviceTags = []string{}
				device.Zones = []string{}
				devices[entry.Mac] = device
			} else {
				val.PSKEntry = PSKEntry{Type: entry.Type, Psk: entry.Psk}
				if val.Name == "" && entry.Comment != "" {
					val.Name = entry.Comment
				}
				devices[entry.Mac] = val
			}
		}

	}

	if saveUpdate {
		if _, err = os.Stat(DevicesConfigPath); os.IsNotExist(err) {
			err := os.Mkdir(DevicesConfigPath, 0755)
			if err != nil {
				log.Fatal(err)
			}
		}

		file, _ := json.MarshalIndent(devices, "", " ")
		err = ioutil.WriteFile(DevicesConfigFile, file, 0600)
		if err != nil {
			log.Fatal(err)
		}

		file, _ = json.MarshalIndent(newZones, "", " ")
		err = ioutil.WriteFile(ZonesConfigFile, file, 0600)
		if err != nil {
			log.Fatal(err)
		}

		err = os.Rename(DeprecatedZonesConfigPath, DeprecatedZonesConfigPath+".bak-upgrade")
		if err != nil {
			log.Fatal(err)
		}

		err = os.Rename(DeprecatedPSKConfigPath, DeprecatedPSKConfigPath+".bak-upgrade")
		if err != nil {
			log.Fatal(err)
		}

	}

}
