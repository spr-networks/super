package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"
)

import (
	"github.com/gorilla/mux"
)

var PlusUser = "lts-super-plus"
var PfwGitURL = "github.com/spr-networks/pfw_extension"
var MeshGitURL = "github.com/spr-networks/mesh_extension"

var MeshdSocketPath = TEST_PREFIX + "/state/plugins/mesh/socket"


type PluginConfig struct {
	Name            string
	URI             string
	UnixPath        string
	Enabled         bool
	Plus            bool
	GitURL          string
	ComposeFilePath string
}

var gPlusExtensionDefaults = []PluginConfig{
	{"PFW", "pfw", "/state/plugins/pfw/socket", false, true, PfwGitURL, "plugins/plus/pfw_extension/docker-compose.yml"},
	{"MESH", "mesh", MeshdSocketPath, false, true, MeshGitURL, "plugins/plus/mesh_extension/docker-compose.yml"},
}

var gPluginTemplates = []PluginConfig{
	{
   Name: "dns-block-extension",
   URI: "dns/block",
   UnixPath: "/state/dns/dns_block_plugin",
   Enabled: true,
  },
  {
   Name: "dns-log-extension",
   URI: "dns/log",
   UnixPath: "/state/dns/dns_log_plugin",
   Enabled: true,
  },
  {
   Name: "plugin-lookup",
   URI: "lookup",
   UnixPath: "/state/plugins/plugin-lookup/lookup_plugin",
   Enabled: true,
  },
  {
   Name: "wireguard",
   URI: "wireguard",
   UnixPath: "/state/plugins/wireguard/wireguard_plugin",
   Enabled: true,
  },
  {
   Name: "dyndns",
   URI: "dyndns",
   UnixPath: "/state/plugins/dyndns/dyndns_plugin",
   Enabled: true,
  },
  {
   Name: "db",
   URI: "db",
   UnixPath: "/state/plugins/db/socket",
   Enabled: true,
 	},
	//these have no API for now
	{
	 Name: "PPP",
	 Enabled: false,
	 ComposeFilePath: "ppp/docker-compose.yml",
  },
	{
	 Name: "WIFI_UPLINK",
	 Enabled: false,
	 ComposeFilePath: "wifi_uplink/docker-compose.yml",
  },
	}

func updateConfigPluginDefaults(config *APIConfig) {
		//helper for updating the config to include defaults in the template
		//assumes config is locked

		covered := []string{}
		for _, entry := range config.Plugins {
			covered = append(covered, entry.Name)
		}

		//merge templates into config.Plugins
		for _, template := range gPluginTemplates {
			hasEntry := false
			for _, name := range covered {
				if name == template.Name {
					hasEntry = true
					break
				}
			}
			if !hasEntry {
				config.Plugins = append(config.Plugins, template)
			}
		}
}

func PluginProxy(config PluginConfig) (*httputil.ReverseProxy, error) {
	return &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = "http"
			req.URL.Host = config.Name

			//Empty headers from the request
			//SECURITY benefit: API extensions do not receive credentials
			req.Header = http.Header{}
		},
		Transport: &http.Transport{
			Dial: func(network, addr string) (net.Conn, error) {
				return net.Dial("unix", config.UnixPath)
			},
		},
	}, nil
}

func PluginRequestHandler(proxy *httputil.ReverseProxy) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		rest := mux.Vars(r)["rest"]
		if rest != "" {
			r.URL.Path = "/" + rest
		}
		proxy.ServeHTTP(w, r)
	}
}

func PluginEnabled(name string) bool {
	for _, entry := range config.Plugins {
		if entry.Name == name && entry.Enabled == true {
			return true
		}
	}
	return false
}

func PlusEnabled() bool {
	return config.PlusToken != ""
}

func getPlugins(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	ret := config.Plugins

	if PlusEnabled() {
		for _, defaultPlusPlugin := range gPlusExtensionDefaults {
			exists := false
			for _, entry := range config.Plugins {
				if entry.Plus == true && entry.UnixPath == defaultPlusPlugin.UnixPath {
					exists = true
					break
				}
			}

			if !exists {
				ret = append(ret, defaultPlusPlugin)
			}
		}

	}

	json.NewEncoder(w).Encode(ret)
}

func updatePlugins(router *mux.Router) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		name := mux.Vars(r)["name"]
		name = trimLower(name)

		if name == "" {
			http.Error(w, "Invalid device name", 400)
			return
		}

		plugin := PluginConfig{}
		err := json.NewDecoder(r.Body).Decode(&plugin)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		if r.Method == http.MethodDelete {
			found := false
			for idx, entry := range config.Plugins {
				if entry.Name == name {
					config.Plugins = append(config.Plugins[:idx], config.Plugins[idx+1:]...)
					found = true
					break
				}
			}

			if !found {
				http.Error(w, "Not found", 404)
				return
			}
		} else {
			// validate
			validName := regexp.MustCompile(`^[A-Za-z0-9\-]+$`).MatchString
			validURI := regexp.MustCompile(`^[A-Za-z0-9\/\-]+$`).MatchString
			validUnixPath := regexp.MustCompile(`^[A-Za-z0-9\/\-\._]+$`).MatchString

			if !validName(plugin.Name) {
				http.Error(w, "Invalid Name", 400)
				return
			}

			if !validURI(plugin.URI) {
				http.Error(w, "Invalid URI", 400)
				return
			}

			if !validUnixPath(plugin.UnixPath) {
				http.Error(w, "Invalid UnixPath", 400)
				return
			}

			// check if exists -- if so update, else create a new entry
			found := false
			for idx, entry := range config.Plugins {
				if entry.Name == name || entry.Name == plugin.Name {
					found = true
					config.Plugins[idx] = plugin
					break
				}
			}

			if !found {
				config.Plugins = append(config.Plugins, plugin)
			}
		}

		saveConfig()
		PluginRoutes(router)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(config.Plugins)
	}
}

func PluginRoutes(external_router_authenticated *mux.Router) {
	for _, entry := range config.Plugins {
		if !entry.Enabled {
			continue
		}

		if entry.URI == "" || entry.UnixPath == "" {
			//skip entires with no URI OR no config.UnixPath
			continue
		}

		proxy, err := PluginProxy(entry)
		if err != nil {
			panic(err)
		}

		external_router_authenticated.HandleFunc("/plugins/"+entry.URI+"/", PluginRequestHandler(proxy))
		external_router_authenticated.HandleFunc("/plugins/"+entry.URI+"/"+"{rest:.*}", PluginRequestHandler(proxy))
	}

	//start extension
	withRetry(30, 3, startExtensionServices)
}

func withRetry(interval int, attempts int, target func() error) {
	go func() {

		for i := 0; i < attempts; i++ {
			err := target()
			if err == nil {
				break
			}

			time.Sleep(time.Duration(interval) * time.Second)
		}
	}()
}

// PLUS feature support

func validPlusToken(token string) bool {
	validToken := regexp.MustCompile(`^[A-za-z0-9_]{40}$`).MatchString
	if !validToken(token) {
		fmt.Println("invalid token format")
		return false
	}

	cmd := exec.Command("git", "ls-remote", "https://"+PlusUser+":"+token+"@"+PfwGitURL)
	stdout, err := cmd.Output()

	if err != nil {
		fmt.Println("git ls-remote failed", err)
		fmt.Println(cmd)
		return false
	}

	if strings.Contains(string(stdout), "HEAD") {
		return true
	}

	fmt.Println("ls-remote failed to get expected result")
	return false
}

func plusToken(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(config.PlusToken)
		return
	}

	//PUT
	token := ""
	err := json.NewDecoder(r.Body).Decode(&token)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if validPlusToken(token) {
		config.PlusToken = token
		err := installPlus()
		if err == nil {
			saveConfig()
			fmt.Println("[+] Installed token")
			return
		} else {
			config.PlusToken = ""
			fmt.Println("[-] Installation failure")
		}
	}

	http.Error(w, "Invalid token", 400)
	return
}

func getSuperdClient() http.Client {
	c := http.Client{}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", SuperdSocketPath)
		},
	}
	return c
}

func getMeshdClient() http.Client {
	c := http.Client{}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", MeshdSocketPath)
		},
	}
	return c
}

type GhcrCreds struct {
	Username string
	Secret   string
}

func ghcrSuperdLogin() bool {
	if config.PlusToken == "" {
		return false
	}

	creds := GhcrCreds{PlusUser, config.PlusToken}
	jsonValue, _ := json.Marshal(creds)

	req, err := http.NewRequest(http.MethodPut, "http://localhost/ghcr_auth", bytes.NewBuffer(jsonValue))
	if err != nil {
		return false
	}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println("superd request failed", err)
		return false
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		fmt.Println("ghcr login failed", resp.StatusCode)
		return false
	}

	return true
}

func generatePFWAPIToken() {
	//install API token for PLUS
	var pfwConfigFile = TEST_PREFIX + "/configs/pfw/rules.json"
	value := genBearerToken()
	pfw_token := Token{"PLUS-API-Token", value, 0, []string{}}

	Tokensmtx.Lock()
	defer Tokensmtx.Unlock()

	tokens := []Token{}
	data, err := os.ReadFile(AuthTokensFile)

	foundToken := false
	if err == nil {
		_ = json.Unmarshal(data, &tokens)
		for _, token := range tokens {
			if token.Name == pfw_token.Name {
				//re-use the PFW token
				value = token.Token
				pfw_token.Token = value
				//re-use existing token
				foundToken = true
				break
			}
		}
	}

	if !foundToken {
		//add the generated token and save it to the token file
		tokens = append(tokens, pfw_token)
		file, _ := json.MarshalIndent(tokens, "", " ")
		err = ioutil.WriteFile(AuthTokensFile, file, 0660)
		if err != nil {
			fmt.Println("failed to write tokens file", err)
		}
	}

	//now save the rules.json with this token
	pfw_config := make(map[string]interface{})

	data, err = os.ReadFile(AuthTokensFile)
	if err == nil {
		//read existing configuration
		_ = json.Unmarshal(data, &pfw_config)
	}

	//set the API token
	pfw_config["APIToken"] = value

	file, _ := json.MarshalIndent(pfw_config, "", " ")
	err = ioutil.WriteFile(pfwConfigFile, file, 0660)
	if err != nil {
		fmt.Println("failed to write pfw configuration", err)
	}

}

func downloadPlusExtension(gitURL string) bool {
	params := url.Values{}
	params.Set("git_url", gitURL)

	creds := GhcrCreds{PlusUser, config.PlusToken}
	jsonValue, _ := json.Marshal(creds)

	req, err := http.NewRequest(http.MethodPut, "http://localhost/update_git?"+params.Encode(), bytes.NewBuffer(jsonValue))
	if err != nil {
		return false
	}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println("superd request failed", err)
		return false
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		fmt.Println("failed to download extension: "+gitURL, resp.StatusCode)
		return false
	}

	generatePFWAPIToken()

	return true
}

func startExtension(composeFilePath string) bool {
	params := url.Values{}
	params.Set("compose_file", composeFilePath)

	req, err := http.NewRequest(http.MethodPut, "http://localhost/start?"+params.Encode(), nil)
	if err != nil {
		return false
	}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println("superd request failed", err)
		return false
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		fmt.Println("failed to start " + composeFilePath + "  extension", resp.StatusCode)
		return false
	}

	return true
}

func updatePlusExtension(composeFilePath string) bool {
	params := url.Values{}
	params.Set("compose_file", composeFilePath)

	req, err := http.NewRequest(http.MethodPut, "http://localhost/update?"+params.Encode(), nil)
	if err != nil {
		return false
	}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println("superd request failed", err)
		return false
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		fmt.Println("failed to update pfw extension", resp.StatusCode)
		return false
	}

	return true
}

func stopPlusExt(w http.ResponseWriter, r *http.Request) {
	name := ""
	err := json.NewDecoder(r.Body).Decode(&name)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	for _, entry := range config.Plugins {
		if entry.Name == name && entry.ComposeFilePath != "" {
			if !stopExtension(entry.ComposeFilePath) {
				http.Error(w, "Failed to stop service", 400)
				return
			}
			return
		}
	}

	http.Error(w, "Plus extension not found: "+name, 404)
}

func startPlusExt(w http.ResponseWriter, r *http.Request) {
	name := ""
	err := json.NewDecoder(r.Body).Decode(&name)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	for _, entry := range config.Plugins {
		if entry.Name == name && entry.ComposeFilePath != "" && entry.Enabled == true {

			if entry.Plus == true {
				//only plus extensions update for now
				if !updatePlusExtension(entry.ComposeFilePath) {
					fmt.Println("[-] Failed to update pfw")
				}
			}

			if !startExtension(entry.ComposeFilePath) {
				http.Error(w, "Failed to start service", 400)
				return
			}
			return
		}
	}

	http.Error(w, "Plus extension not found: "+name, 404)
}

func stopExtension(composeFilePath string) bool {

	params := url.Values{}
	params.Set("compose_file", composeFilePath)

	req, err := http.NewRequest(http.MethodPut, "http://localhost/stop?"+params.Encode(), nil)
	if err != nil {
		return false
	}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println("superd request failed", err)
		return false
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		fmt.Println("failed to stop " + composeFilePath + " extension", resp.StatusCode)
		return false
	}

	return true
}

func stopExtensionServices() error {
	for _, entry := range config.Plugins {
		if entry.Enabled && entry.ComposeFilePath != "" {
			if !stopExtension(entry.ComposeFilePath) {
				return errors.New("Could not stop Extension at " + entry.ComposeFilePath)
			}
		}
	}
	return nil
}

func installPlus() error {
	for _, plugin := range gPlusExtensionDefaults {
		if !downloadPlusExtension(plugin.GitURL) {
			return errors.New("failed to download plugin " + plugin.GitURL)
		}
	}

	if !ghcrSuperdLogin() {
		//do not automatically fail, a source build could still work
		fmt.Println("failed to log into ghcr")
	}

	return startExtensionServices()
}

func startExtensionServices() error {

	if PlusEnabled() {
		//log into GHCR for PLUS
		ghcrSuperdLogin()
	}

	/*
		For now, the only plugin is PFW. This is hardcoded.
		In the future, a list of PLUS extensions can be dynamically configured
	*/
	for _, entry := range config.Plugins {
		if entry.ComposeFilePath != "" && entry.Enabled == true {

			if entry.Plus == true  {
				//only plus extensions need updates for now
				//as the others are built-in. this can change later
				//when third party extensions are supported
				if !updatePlusExtension(entry.ComposeFilePath) {
					return errors.New("Could not update PLUS Extension at " + entry.ComposeFilePath)
				}
			}

			if !startExtension(entry.ComposeFilePath) {
				return errors.New("Could not start Extension at " + entry.ComposeFilePath)
			}
		}
	}
	return nil
}

// mesh support
func updateMeshPluginPut(endpoint string, jsonValue []byte) {

	if !PlusEnabled() {
		return
	}

	if !PluginEnabled("MESH") {
		return
	}

	req, err := http.NewRequest(http.MethodPut, "http://localhost/"+endpoint, bytes.NewBuffer(jsonValue))
	if err != nil {
		return
	}

	c := getMeshdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println("meshd request failed", err, endpoint)
		return
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		fmt.Println("meshd request failed", resp.StatusCode, endpoint)
		return
	}

}

func deauthConnectedStation(event PSKAuthSuccess) {
	devices := getDevicesJson()
	device, exists := devices[event.MAC]
	if exists {
		established_route_device := getRouteInterface(device.RecentIP)
		if isAPVlan(established_route_device) {
			//okay, now we want to send a deauth command to this AP
			parts := strings.Split(established_route_device, ".")
			if len(parts) == 2 {
				iface := parts[0]
				RunHostapdCommandArray(iface, []string{"disassociate", event.MAC})
				RunHostapdCommandArray(iface, []string{"deauthenticate", event.MAC})
			}
		}
	}
}

func updateMeshPluginConnect(event PSKAuthSuccess) {

	if !PlusEnabled() {
		return
	}

	if !PluginEnabled("MESH") {
		return
	}

	if event.Router != "" {
		deauthConnectedStation(event)
	}

	jsonValue, _ := json.Marshal(event)
	go updateMeshPluginPut("stationConnect", jsonValue)
}

func updateMeshPluginConnectFailure(event PSKAuthFailure) {
	jsonValue, _ := json.Marshal(event)
	go updateMeshPluginPut("stationConnectFailure", jsonValue)
}

func updateMeshPluginDisconnect(event StationDisconnect) {
	jsonValue, _ := json.Marshal(event)
	go updateMeshPluginPut("stationDisconnect", jsonValue)
}

func updateMeshPluginPSKReload(devices map[string]DeviceEntry) {
	jsonValue, _ := json.Marshal(devices)
	go updateMeshPluginPut("syncDevices", jsonValue)
}

func updateMeshPluginGlobalSSID(SSID string) {
	jsonValue, _ := json.Marshal(SSID)
	go updateMeshPluginPut("setSSID", jsonValue)
}
