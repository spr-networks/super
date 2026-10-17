package common

// The compose files superd may run. Plugin containers are a privilege
// escalation, so only console access adds paths (custom_compose_paths.json).

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"sort"
	"sync"
)

var ComposeAllowListDefaults = []string{"docker-compose.yml", "docker-compose-test.yml", "docker-compose-virt.yml",
	"plugins/plus/pfw_extension/docker-compose.yml",
	"plugins/plus/mesh_extension/docker-compose.yml",
	"dyndns/docker-compose.yml",
	"ppp/docker-compose.yml",
	"wifid-setup/docker-compose.yml",
	"wifid-setup/docker-compose-test.yml",
	"wifi_uplink/docker-compose.yml"}

var ComposeAllowList = ComposeAllowListDefaults

var CustomAllowPath = "configs/base/custom_compose_paths.json"

var composeAllowMtx sync.Mutex

func ReloadComposeAllowList() {
	//augment ComposeAllowList

	data, err := ioutil.ReadFile(CustomAllowPath)
	if err == nil {
		newAllow := []string{}
		err = json.Unmarshal(data, &newAllow)
		if err != nil {
			fmt.Println("Failed to load custom compose json", err)
		} else {
			ComposeAllowList = append(ComposeAllowListDefaults, newAllow...)
		}
	}

}

func ComposePathAllowed(composeFilePath string) bool {
	ReloadComposeAllowList()
	for _, entry := range ComposeAllowList {
		if entry == composeFilePath {
			return true
		}
	}
	return false
}

func AllowPluginRuntimeCompose(composeFilePath string) error {
	composeAllowMtx.Lock()
	defer composeAllowMtx.Unlock()

	paths := []string{}
	data, err := os.ReadFile(CustomAllowPath)
	if err == nil {
		if err := json.Unmarshal(data, &paths); err != nil {
			return err
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	for _, entry := range paths {
		if entry == composeFilePath {
			return nil
		}
	}
	paths = append(paths, composeFilePath)
	sort.Strings(paths)
	data, err = json.MarshalIndent(paths, "", " ")
	if err != nil {
		return err
	}
	tmpPath := CustomAllowPath + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0600); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, CustomAllowPath); err != nil {
		os.Remove(tmpPath)
		return err
	}
	ReloadComposeAllowList()
	return nil
}

func ComposePaths(w http.ResponseWriter, r *http.Request) {
	//NOTE: DO NOT add modification here. A user should have to
	// be using console access to add paths, since docker containers
	// represent privilege escalation
	// That should not happen from the UI alone.
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ComposeAllowList)
}
