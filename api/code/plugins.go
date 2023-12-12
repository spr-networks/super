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
var CustomComposeAllowPath = TEST_PREFIX + "/configs/base/custom_compose_paths.json"

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
		Name:     "dns-block-extension",
		URI:      "dns/block",
		UnixPath: "/state/dns/dns_block_plugin",
		Enabled:  true,
	},
	{
		Name:     "dns-log-extension",
		URI:      "dns/log",
		UnixPath: "/state/dns/dns_log_plugin",
		Enabled:  true,
	},
	{
		Name:     "plugin-lookup",
		URI:      "lookup",
		UnixPath: "/state/plugins/plugin-lookup/lookup_plugin",
		Enabled:  true,
	},
	{
		Name:     "wireguard",
		URI:      "wireguard",
		UnixPath: "/state/plugins/wireguard/wireguard_plugin",
		Enabled:  true,
	},
	{
		Name:            "dyndns",
		URI:             "dyndns",
		UnixPath:        "/state/plugins/dyndns/dyndns_plugin",
		Enabled:         false,
		ComposeFilePath: "dyndns/docker-compose.yml",
	},
	{
		Name:     "db",
		URI:      "db",
		UnixPath: "/state/plugins/db/socket",
		Enabled:  true,
	},
	//these have no API for now
	{
		Name:            "PPP",
		Enabled:         false,
		ComposeFilePath: "ppp/docker-compose.yml",
	},
	{
		Name:            "WIFIUPLINK",
		Enabled:         false,
		ComposeFilePath: "wifi_uplink/docker-compose.yml",
	},
}

func updateConfigPluginDefaults(config *APIConfig) bool {
	//helper for updating the config to include defaults in the template
	//assumes config is locked
	update := false

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
			update = true
		}
	}

	//handle migrations
	for _, entry := range config.Plugins {
		if entry.Name == "dyndns" {
			if entry.ComposeFilePath == "" {
				entry.ComposeFilePath = "dyndns/docker-compose.yml"
				update = true
			}
		}
	}

	return update

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

func validatePlus(plugin PluginConfig) bool {
	//validate PLUS, GitURL and ComposeFilePath is whitelisted.

	//let superd handle validating ComposeFilePath for custom plugins.
	if plugin.Plus == true {
		for _, plusPlugin := range gPlusExtensionDefaults {
			if plusPlugin.GitURL == plugin.GitURL && plusPlugin.ComposeFilePath == plugin.ComposeFilePath {
				//found a match
				return true
			}
		}
		return false
	} else {
		//only PLUS plugins have git urls for now
		if plugin.GitURL != "" {
			return false
		}
	}

	return true
}
func getPlugins(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	Configmtx.Lock()
	defer Configmtx.Unlock()

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

// this is a nested function since
// we have to update the router when plugins
// are managed.
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

		Configmtx.Lock()
		defer Configmtx.Unlock()

		if r.Method == http.MethodDelete {
			found := false
			for idx, entry := range config.Plugins {
				if entry.Name == name {
					config.Plugins = append(config.Plugins[:idx], config.Plugins[idx+1:]...)
					found = true

					// plugin was deleted, stop it
					stopExtension(entry.ComposeFilePath)
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

			if plugin.URI != "" && !validURI(plugin.URI) {
				http.Error(w, "Invalid URI", 400)
				return
			}

			if plugin.UnixPath != "" && !validUnixPath(plugin.UnixPath) {
				http.Error(w, "Invalid UnixPath", 400)
				return
			}

			// check if exists -- if so update, else create a new entry
			found := false
			for idx, entry := range config.Plugins {
				if entry.Name == name || entry.Name == plugin.Name {
					found = true
					config.Plugins[idx] = plugin

					if plugin.Enabled == false {
						//plugin is on longer enabled, send stop
						stopExtension(entry.ComposeFilePath)
					}

					break
				}
			}

			if !found {
				//when creating, make sure these are known plus
				if !validatePlus(plugin) {
					http.Error(w, "invalid plugin options", 400)
				}

				config.Plugins = append(config.Plugins, plugin)
			}
		}

		saveConfigLocked()
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

func restartPlugin(name string) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	for _, entry := range config.Plugins {
		//carefully only send restart if enabled is set
		//in case caller does not check.
		if entry.Name == name && entry.Enabled == true {
			if entry.ComposeFilePath != "" {
				callSuperdRestart(entry.ComposeFilePath, "")
			}
		}
	}

}

func handleRestartPlugin(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]
	restartPlugin(name)
}

func enablePlugin(name string) bool {
	//returns true if a change was made
	Configmtx.Lock()
	defer Configmtx.Unlock()
	ret := false

	if !PluginEnabled(name) {
		//enable it

		for i, entry := range config.Plugins {
			if entry.Name == name {
				config.Plugins[i].Enabled = true
				if entry.ComposeFilePath != "" {
					startExtension(entry.ComposeFilePath)
					ret = true
				}
				break
			}
		}

		saveConfigLocked()
	}

	return ret
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

func plusTokenValid(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	token := config.PlusToken
	Configmtx.Unlock()

	if token == "" {
		http.Error(w, "Empty plus token", 400)
		return
	}
	valid := validPlusToken(token)
	if valid {
		//200 for valid
		return
	}

	http.Error(w, "Invalid plus token", 400)
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

	Configmtx.Lock()
	defer Configmtx.Unlock()

	if validPlusToken(token) {
		config.PlusToken = token
		err := installPlus()
		if err == nil {
			saveConfigLocked()
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
		err = ioutil.WriteFile(AuthTokensFile, file, 0600)
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
	err = ioutil.WriteFile(pfwConfigFile, file, 0600)
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
	if composeFilePath == "" {
		//no-op
		return true
	}
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
		fmt.Println("failed to start "+composeFilePath+"  extension", resp.StatusCode)
		return false
	}

	return true
}

func updateExtension(composeFilePath string) bool {
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

	Configmtx.Lock()
	defer Configmtx.Unlock()

	for _, entry := range config.Plugins {
		if entry.Name == name {
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

	Configmtx.Lock()
	defer Configmtx.Unlock()

	for _, entry := range config.Plugins {
		if entry.Name == name && entry.ComposeFilePath != "" && entry.Enabled == true {

			if PlusEnabled() && entry.Plus == true {
				//only plus extensions update on start for now
				if !updateExtension(entry.ComposeFilePath) {
					fmt.Println("[-] Failed to update extension " + entry.ComposeFilePath)
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

	if composeFilePath == "" {
		//if theres no custom compose path,
		// this is a built-in plugin in the superd compose file
		// and this call to stop is a no-op
		return true
	}

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
		fmt.Println("failed to stop "+composeFilePath+" extension", resp.StatusCode)
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

	for _, entry := range config.Plugins {
		if entry.ComposeFilePath != "" && entry.Enabled == true {

			if PlusEnabled() && entry.Plus == true {
				//only plus extensions update on start for now
				if !updateExtension(entry.ComposeFilePath) {
					return errors.New("Could not update Extension at " + entry.ComposeFilePath)
				}
			}

			if !startExtension(entry.ComposeFilePath) {
				return errors.New("Could not start Extension at " + entry.ComposeFilePath)
			}
		}
	}
	return nil
}

func callSuperdRestart(composePath string, target string) {
	c := http.Client{}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", SuperdSocketPath)
		},
	}
	defer c.CloseIdleConnections()

	append := ""
	do_append := false
	params := url.Values{}

	if target != "" {
		params.Set("service", target)
		do_append = true
	}

	if composePath != "" {
		params.Set("compose_file", composePath)
		do_append = true
	}

	if do_append {
		append += "?" + params.Encode()
	}

	req, err := http.NewRequest(http.MethodPut, "http://localhost/restart"+append, nil)
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

func modifyCustomComposePaths(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	if r.Method == http.MethodGet {
		curList := []string{}
		data, err := ioutil.ReadFile(CustomComposeAllowPath)
		if err == nil {
			_ = json.Unmarshal(data, &curList)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(curList)
		return
	}

	newList := []string{}
	err := json.NewDecoder(r.Body).Decode(&newList)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	file, _ := json.MarshalIndent(newList, "", " ")
	err = ioutil.WriteFile(CustomComposeAllowPath, file, 0600)
	if err != nil {
		log.Println("failed to write custom compose paths configuration", err)
		http.Error(w, err.Error(), 400)
		return
	}
}
