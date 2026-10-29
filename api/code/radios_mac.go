package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"

	"github.com/gorilla/mux"
)

// applyAPMACRepair updates only this radio; other radios may have randomization
// enabled and must not receive new addresses as a side effect of a repair.
var applyAPMACRepair = func(iface string) {
	if refreshInterfaceOverridesLocked(iface) {
		callSuperdRestart("", "wifid")
	}
}

func repairAPMACConfig(config []InterfaceConfig, iface, expected, target string) (bool, error) {
	mac, err := net.ParseMAC(target)
	if !isValidIface(iface) || err != nil || len(mac) != 6 || mac[0]&3 != 2 {
		return false, fmt.Errorf("repair requires a valid interface and locally administered unicast MAC")
	}
	target = mac.String()
	for i := range config {
		entry := &config[i]
		if entry.Name != iface {
			continue
		}
		if entry.Type != "AP" || !entry.Enabled || entry.MACRandomize {
			return false, fmt.Errorf("MAC repair requires an enabled AP with MAC randomization disabled")
		}
		if entry.MACOverride == target {
			return false, nil // A retry must not restart Wi-Fi again.
		}
		if entry.MACOverride != expected {
			return false, fmt.Errorf("MAC override changed since the mesh inventory was read")
		}
		entry.MACOverride = target
		// Keep the saved guest source in sync so later config regeneration
		// derives both the primary and guest BSSIDs from the repaired address.
		for j := range entry.ExtraBSS {
			entry.ExtraBSS[j].Bssid = target
		}
		return true, nil
	}
	return false, fmt.Errorf("AP interface not found")
}

func hostapdDeduplicateMAC(w http.ResponseWriter, r *http.Request) {
	var request struct {
		MACOverride         string
		ExpectedMACOverride string
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	iface := mux.Vars(r)["interface"]
	Interfacesmtx.Lock()
	defer Interfacesmtx.Unlock()
	config := loadInterfacesConfigLocked()
	changed, err := repairAPMACConfig(config, iface, request.ExpectedMACOverride, request.MACOverride)
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	if changed {
		if err := writeInterfacesConfigLocked(config); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		applyAPMACRepair(iface)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"Changed": changed})
}
