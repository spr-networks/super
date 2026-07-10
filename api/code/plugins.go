package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"
)

import (
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

var PlusUser = "lts-super-plus"
var PfwGitURL = "git.plus.supernetworks.org/spr-networks/pfw_extension"
var MeshGitURL = "git.plus.supernetworks.org/spr-networks/mesh_extension"
var OldPfwGitURL = "github.com/spr-networks/pfw_extension"
var OldMeshGitURL = "github.com/spr-networks/mesh_extension"

var MeshdSocketPath = TEST_PREFIX + "/state/plugins/mesh/socket"
var DbSocketPath = TEST_PREFIX + "/state/plugins/db/socket"
var CustomComposeAllowPath = TEST_PREFIX + "/configs/base/custom_compose_paths.json"
var extensionStartMtx sync.Mutex

type NetworkCapabilities struct {
	Interface string
	Policies  []string
	Groups    []string
}

type PluginConfig struct {
	Name                string
	URI                 string
	UnixPath            string
	Enabled             bool
	Plus                bool
	GitURL              string
	ComposeFilePath     string
	HasUI               bool
	SandboxedUI         bool
	HasTopology         bool
	Icon                string
	InstallTokenPath    string
	ScopedPaths         []string
	NetworkCapabilities NetworkCapabilities
}

func (p PluginConfig) MatchesData(q PluginConfig) bool {
	//compare all but Enabled.
	return p.Name == q.Name &&
		p.URI == q.URI &&
		p.UnixPath == q.UnixPath &&
		p.Plus == q.Plus &&
		p.GitURL == q.GitURL &&
		p.ComposeFilePath == q.ComposeFilePath &&
		p.HasUI == q.HasUI &&
		p.SandboxedUI == q.SandboxedUI &&
		p.HasTopology == q.HasTopology &&
		p.Icon == q.Icon &&
		p.InstallTokenPath == q.InstallTokenPath &&
		slices.Compare(p.ScopedPaths, q.ScopedPaths) == 0 &&
		p.NetworkCapabilities.Interface == q.NetworkCapabilities.Interface &&
		slices.Compare(p.NetworkCapabilities.Policies, q.NetworkCapabilities.Policies) == 0 &&
		slices.Compare(p.NetworkCapabilities.Groups, q.NetworkCapabilities.Groups) == 0
}

var gPlusExtensionDefaults = []PluginConfig{
	{"PFW", "pfw", "/state/plugins/pfw/socket", false, true, PfwGitURL, "plugins/plus/pfw_extension/docker-compose.yml", false, false, true, "", "", []string{}, NetworkCapabilities{}},
	{"MESH", "mesh", MeshdSocketPath, false, true, MeshGitURL, "plugins/plus/mesh_extension/docker-compose.yml", false, false, false, "", "", []string{}, NetworkCapabilities{}},
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
	for i, entry := range config.Plugins {
		if entry.Name == "dyndns" {
			if entry.ComposeFilePath == "" {
				config.Plugins[i].ComposeFilePath = "dyndns/docker-compose.yml"
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
		r.URL.Path = "/" + rest
		proxy.ServeHTTP(w, r)
	}
}

// NOTE this should only forward to /static/css|js/x.y and other static files
func PluginRequestHandlerPublic(proxy *httputil.ReverseProxy) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		rest := mux.Vars(r)["rest"]
		r.URL.Path = "/static/" + rest
		proxy.ServeHTTP(w, r)
	}
}

func PluginRequestHandlerCert(proxy *httputil.ReverseProxy) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		r.URL.Path = "/cert"
		proxy.ServeHTTP(w, r)
	}
}

const PluginsHostSuffix = ".plugins.spr.lan"

func notStaticPrefix(r *http.Request, _ *mux.RouteMatch) bool {
	return !strings.HasPrefix(r.URL.Path, "/static/")
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
			if plusPlugin.GitURL == plugin.GitURL || plugin.GitURL == OldMeshGitURL || plugin.GitURL == OldPfwGitURL {
				if plusPlugin.ComposeFilePath == plugin.ComposeFilePath {
					return true
				}
			}
		}
		return false
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
func updatePlugins(router *mux.Router, router_public *mux.Router) func(http.ResponseWriter, *http.Request) {
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

					// plugin was deleted, take its compose project down
					// (containers + networks); fall back to stop for older superd
					if !downExtension(entry.ComposeFilePath) {
						stopExtension(entry.ComposeFilePath)
					}
					// Remove network capabilities firewall rules
					removePluginNetworkCapabilities(entry)
					// also remove if its a custom plugin
					dirName := filepath.Dir(entry.ComposeFilePath)
					isUserPlugin := regexp.MustCompile(`^plugins/user/[A-Za-z0-9\-]+$`).MatchString
					if isUserPlugin(dirName) {
						removeExtension(entry.ComposeFilePath)
					}

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
			idx := -1
			oldComposeFilePath := plugin.ComposeFilePath
			currentPlugin := PluginConfig{}

			for idx_, entry := range config.Plugins {
				idx = idx_
				if entry.Name == name || entry.Name == plugin.Name {
					found = true
					currentPlugin = entry
					oldComposeFilePath = entry.ComposeFilePath
					break
				}
			}

			//make sure these are known plus
			if !validatePlus(plugin) {
				http.Error(w, "invalid plugin options", 400)
				return
			}

			//if a GitURL is set, ensure OTP authentication for 'admin'
			if !plugin.Plus && plugin.GitURL != "" {

				check_otp := true
				if found {
					if currentPlugin.MatchesData(plugin) {
						//for on/off with Enabled state don't need to validate the otp
						check_otp = false
					}
				}

				if check_otp && !hasValidJwtOtpHeader("admin", r) {
					http.Redirect(w, r, "/auth/validate", 302)
					return
				}

				//download new plugins
				if !found {
					//clone but don't auto-config.
					ret := downloadUserExtension(plugin.GitURL, false)
					if ret == false {
						fmt.Println("Failed to download extension " + plugin.GitURL)
						// fall thru, dont fail
					}
				}
			}

			if !found {
				config.Plugins = append(config.Plugins, plugin)
			} else {
				if plugin.Enabled == false {
					//plugin is no longer enabled, send stop
					stopExtension(oldComposeFilePath)
					// Remove network capabilities firewall rules
					removePluginNetworkCapabilities(config.Plugins[idx])

					//wireguard is built-in (no compose); bring its interface down
					if name == "wireguard" {
						callWireguardDown()
					}
				}
				config.Plugins[idx] = plugin
			}
		}

		saveConfigLocked()
		PluginRoutes(router, router_public)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(config.Plugins)
	}
}

func PluginRoutes(external_router_authenticated *mux.Router, external_router_public *mux.Router) {
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

		// auth-less exception to avoid MITM attacks on Auth Token.
		if entry.Plus && entry.URI == "mesh" {
			external_router_public.HandleFunc("/mesh/cert", PluginRequestHandlerCert(proxy))
		}

		if entry.HasUI {
			//plugin index.html is fetch with auth @ /plugins/xyz/index.html
			//static files are available at /admin/custom_plugin/xyz/static/css|js/ to match the react url

			external_router_public.HandleFunc("/admin/custom_plugin/"+entry.URI+"/static/"+"{rest:.*}", PluginRequestHandlerPublic(proxy))

			//create a ws proxy handler
			// for future consideration
			//external_router_public.HandleFunc("/admin/custom_plugin/ws/"+entry.URI+"/"+"{rest:.*}", WebSocketPluginHandler(entry))

		}

		vhost := entry.URI + PluginsHostSuffix
		external_router_authenticated.Host(vhost).MatcherFunc(notStaticPrefix).Handler(proxy)
		if entry.HasUI {
			external_router_public.Host(vhost).PathPrefix("/static/").Handler(proxy)
		}
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
				applyPluginNetworkCapabilitiesRetry(entry)
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
	c := http.Client{Timeout: 120 * time.Second}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", SuperdSocketPath)
		},
	}
	return c
}

func getMeshdClient() http.Client {
	c := http.Client{Timeout: 20 * time.Second}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", MeshdSocketPath)
		},
	}
	return c
}

type GitOptions struct {
	Username   string
	Secret     string
	Plus       bool
	AutoConfig bool
}

func superdRequest(pathname string, params url.Values, body io.Reader) ([]byte, error) {
	data, statusCode, err := superdRequestMethod(http.MethodPut, pathname, params, body)

	if statusCode != http.StatusOK {
		fmt.Println("superd call failed for ", pathname, "params=", params, ". status=", statusCode)
		return data, errors.New("Got invalid status code from superd")
	}

	return data, err
}

func superdRequestMethod(method string, pathname string, params url.Values, body io.Reader) ([]byte, int, error) {
	u := url.URL{Scheme: "http", Host: "localhost"}
	u.Path = pathname
	u.RawQuery = params.Encode()

	req, err := http.NewRequest(method, u.String(), body)
	if err != nil {
		return nil, -1, err
	}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println("superd request failed", err)
		return nil, -1, err
	}

	defer resp.Body.Close()
	data, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}

	return data, resp.StatusCode, err
}

func ghcrSuperdLogin() bool {
	if config.PlusToken == "" {
		return false
	}

	creds := GitOptions{PlusUser, config.PlusToken, true, false}
	jsonValue, _ := json.Marshal(creds)

	_, err := superdRequest("ghcr_auth", url.Values{}, bytes.NewBuffer(jsonValue))
	if err != nil {
		return false
	}

	return true
}

func generatePFWAPIToken() {
	//install API token for PLUS
	var pfwConfigFile = TEST_PREFIX + "/configs/pfw/rules.json"
	pfw_token, err := generateOrGetToken("PLUS-API-Token", []string{})

	//now save the rules.json with this token
	pfw_config := make(map[string]interface{})

	data, err := os.ReadFile(pfwConfigFile)
	if err == nil {
		//read existing configuration
		_ = json.Unmarshal(data, &pfw_config)
	}

	//set the API token
	pfw_config["APIToken"] = pfw_token.Token

	file, _ := json.MarshalIndent(pfw_config, "", " ")
	err = ioutil.WriteFile(pfwConfigFile, file, 0600)
	if err != nil {
		fmt.Println("failed to write pfw configuration", err)
	}

}

func downloadExtension(user string, secret string, gitURL string, Plus bool, AutoConfig bool) bool {
	params := url.Values{}
	params.Set("git_url", gitURL)

	creds := GitOptions{user, secret, Plus, AutoConfig}
	jsonValue, _ := json.Marshal(creds)

	if AutoConfig {
		//check if the directory already exists and make an event
		_, statusCode, _ := superdRequestMethod(http.MethodGet, "user_plugin_exists", params, nil)
		if statusCode == 200 {
			SprbusPublish("plugin:download:exists", map[string]string{"GitURL": gitURL})
		}
	}

	data, err := superdRequest("update_git", params, bytes.NewBuffer(jsonValue))
	if err != nil {
		SprbusPublish("plugin:download:failure", map[string]string{"GitURL": gitURL, "Reason": err.Error()})
		return false
	}

	SprbusPublish("plugin:download:success", map[string]string{"GitURL": gitURL})

	if AutoConfig {
		plugin := PluginConfig{}
		err = json.Unmarshal(data, &plugin)
		if err == nil {
			//override GitURL
			plugin.GitURL = gitURL
			return installUserPluginConfig(plugin)
		} else {
			SprbusPublish("plugin:install:failure", map[string]string{"GitURL": gitURL, "Reason": err.Error()})
			return false
		}
	}

	return true
}

func downloadPlusExtension(gitURL string) bool {
	ret := downloadExtension(PlusUser, config.PlusToken, gitURL, true, false)
	if ret == true && gitURL == PfwGitURL || gitURL == OldPfwGitURL {
		generatePFWAPIToken()
	}
	return ret
}

func downloadUserExtension(gitURL string, AutoConfig bool) bool {
	return downloadExtension("", "", gitURL, false, AutoConfig)
}

func startExtension(composeFilePath string) bool {
	if composeFilePath == "" {
		//no-op
		return true
	}

	_, err := superdRequest("start", url.Values{"compose_file": {composeFilePath}}, nil)
	if err != nil {
		return false
	}

	return true
}

func applyPluginNetworkCapabilitiesRetry(plugin PluginConfig) {
	go func() {
		var err error
		for i := 0; i < 36; i++ {
			time.Sleep(5 * time.Second)
			err = applyPluginNetworkCapabilities(plugin)
			if err == nil {
				return
			}
		}
		fmt.Printf("Warning: Failed to apply network capabilities for plugin %s: %v\n", plugin.Name, err)
	}()
}

func applyPluginNetworkCapabilities(plugin PluginConfig) error {
	// Only apply if NetworkCapabilities are defined
	if plugin.NetworkCapabilities.Interface == "" || len(plugin.NetworkCapabilities.Policies) == 0 {
		return nil
	}

	// Get container IP for this plugin
	containerIP, err := getPluginContainerIP(plugin.NetworkCapabilities.Interface)
	if err != nil {
		fmt.Printf("Failed to get container IP for plugin %s: %v\n", plugin.Name, err)
		return err
	}

	// Create CustomInterfaceRule for the plugin container
	rule := CustomInterfaceRule{
		BaseRule: BaseRule{
			RuleName: "Plugin-" + plugin.Name,
			Disabled: false,
		},
		Interface: plugin.NetworkCapabilities.Interface,
		SrcIP:     containerIP,
		RouteDst:  "", // Not needed for basic container access
		Policies:  plugin.NetworkCapabilities.Policies,
		Groups:    plugin.NetworkCapabilities.Groups,
		Tags:      []string{}, // Not used
	}

	// Apply the rule directly via firewall function
	FWmtx.Lock()
	stale := []CustomInterfaceRule{}
	for _, existing := range gFirewallConfig.CustomInterfaceRules {
		if existing.RuleName == rule.RuleName && existing.SrcIP != rule.SrcIP {
			stale = append(stale, existing)
		}
	}
	for _, old := range stale {
		if err := modifyCustomInterfaceRulesImpl(old, true); err != nil {
			fmt.Printf("Failed to remove stale rule %s (%s): %v\n", old.RuleName, old.SrcIP, err)
		}
	}
	err = modifyCustomInterfaceRulesImpl(rule, false) // false = add rule
	FWmtx.Unlock()

	if err != nil {
		if strings.Contains(err.Error(), "Duplicate rule") {
			return nil
		}
		fmt.Printf("Failed to apply network capabilities for plugin %s: %v\n", plugin.Name, err)
		return err
	}

	fmt.Printf("Applied network capabilities for plugin %s\n", plugin.Name)
	return nil
}

func removePluginNetworkCapabilities(plugin PluginConfig) error {
	// Only remove if NetworkCapabilities are defined
	if plugin.NetworkCapabilities.Interface == "" || len(plugin.NetworkCapabilities.Policies) == 0 {
		return nil
	}

	// We need to get the actual rule to delete it properly
	FWmtx.Lock()
	defer FWmtx.Unlock()

	var ruleToDelete *CustomInterfaceRule
	ruleName := "Plugin-" + plugin.Name

	// Find the rule by name
	for _, rule := range gFirewallConfig.CustomInterfaceRules {
		if rule.RuleName == ruleName {
			// Make a copy of the rule
			ruleCopy := rule
			ruleToDelete = &ruleCopy
			break
		}
	}

	if ruleToDelete == nil {
		// Rule not found, which is ok (might have been manually removed)
		return nil
	}

	// Remove the rule using the exact rule data
	err := modifyCustomInterfaceRulesImpl(*ruleToDelete, true) // true = delete rule
	if err != nil {
		fmt.Printf("Failed to remove network capabilities for plugin %s: %v\n", plugin.Name, err)
		return err
	}

	fmt.Printf("Removed network capabilities for plugin %s\n", plugin.Name)
	return nil
}

func getPluginContainerIP(interfaceName string) (string, error) {
	// Compose normally prefixes network names with its project name, while
	// NetworkCapabilities.Interface is the Linux bridge name. Try the direct
	// name first for explicitly named networks, then resolve project-scoped
	// networks by their bridge driver option.
	directData, directErr := dockerRequest("GET", "/v1.41/networks/"+url.PathEscape(interfaceName), nil)
	if directErr == nil {
		if ip, err := pluginContainerIPFromNetwork(directData); err == nil {
			return ip, nil
		}
	}

	data, err := dockerRequest("GET", "/v1.41/networks", nil)
	if err != nil {
		return "", fmt.Errorf("inspect network %s: %v; list networks: %w", interfaceName, directErr, err)
	}

	networkIDs, err := dockerNetworkIDsForBridge(data, interfaceName)
	if err != nil {
		return "", err
	}

	for _, networkID := range networkIDs {
		data, err = dockerRequest("GET", "/v1.41/networks/"+url.PathEscape(networkID), nil)
		if err != nil {
			continue
		}
		if ip, ipErr := pluginContainerIPFromNetwork(data); ipErr == nil {
			return ip, nil
		}
	}

	return "", fmt.Errorf("no container found on Docker network for bridge %s", interfaceName)
}

type dockerPluginNetwork struct {
	ID         string            `json:"Id"`
	Name       string            `json:"Name"`
	Options    map[string]string `json:"Options"`
	Containers map[string]struct {
		IPv4Address string `json:"IPv4Address"`
	} `json:"Containers"`
}

func pluginContainerIPFromNetwork(data []byte) (string, error) {
	var networkInfo dockerPluginNetwork
	if err := json.Unmarshal(data, &networkInfo); err != nil {
		return "", err
	}

	for _, container := range networkInfo.Containers {
		if container.IPv4Address != "" {
			return strings.SplitN(container.IPv4Address, "/", 2)[0], nil
		}
	}

	return "", errors.New("network has no attached container with an IPv4 address")
}

func dockerNetworkIDsForBridge(data []byte, interfaceName string) ([]string, error) {
	var networks []dockerPluginNetwork
	if err := json.Unmarshal(data, &networks); err != nil {
		return nil, err
	}

	var networkIDs []string
	for _, network := range networks {
		if network.Options["com.docker.network.bridge.name"] != interfaceName {
			continue
		}
		if network.ID != "" {
			networkIDs = append(networkIDs, network.ID)
		} else if network.Name != "" {
			networkIDs = append(networkIDs, network.Name)
		}
	}

	if len(networkIDs) == 0 {
		return nil, fmt.Errorf("no Docker network uses bridge %s", interfaceName)
	}

	return networkIDs, nil
}

func restartExtension(composeFilePath string) bool {
	if composeFilePath == "" {
		//no-op
		return true
	}

	_, err := superdRequest("restart", url.Values{"compose_file": {composeFilePath}}, nil)
	if err != nil {
		return false
	}

	return true
}

func updateExtension(composeFilePath string) bool {
	_, err := superdRequest("update", url.Values{"compose_file": {composeFilePath}}, nil)
	if err != nil {
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

	_, err := superdRequest("stop", url.Values{"compose_file": {composeFilePath}}, nil)
	if err != nil {
		return false
	}

	return true
}

// pull a plugin's images via superd; superd cycles it down+up when a new
// image arrived. long timeout: pulls can take minutes.
func updatePluginContainer(w http.ResponseWriter, r *http.Request) {
	name := trimLower(mux.Vars(r)["name"])

	Configmtx.Lock()
	compose := ""
	found := false
	for _, entry := range config.Plugins {
		if trimLower(entry.Name) == name && entry.Enabled {
			compose = entry.ComposeFilePath
			found = true
			break
		}
	}
	Configmtx.Unlock()

	if !found || compose == "" {
		http.Error(w, "Not found", 404)
		return
	}

	c := http.Client{Timeout: 15 * time.Minute}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", SuperdSocketPath)
		},
	}
	defer c.CloseIdleConnections()

	params := url.Values{"compose_file": {compose}}
	req, _ := http.NewRequest(http.MethodPut, "http://localhost/update_container?"+params.Encode(), nil)
	resp, err := c.Do(req)
	if err != nil {
		http.Error(w, "update failed: "+err.Error(), 502)
		return
	}
	defer resp.Body.Close()

	data, _ := ioutil.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		http.Error(w, string(data), resp.StatusCode)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// take a plugin's compose project down: removes its containers and networks
func downExtension(composeFilePath string) bool {
	if composeFilePath == "" {
		return true
	}

	_, err := superdRequest("down", url.Values{"compose_file": {composeFilePath}}, nil)
	if err != nil {
		return false
	}

	return true
}

// remove container from docker
func removeExtension(composeFilePath string) bool {
	fmt.Println("!! removing plugin=", composeFilePath)

	if composeFilePath == "" {
		return true
	}

	_, err := superdRequest("remove", url.Values{"compose_file": {composeFilePath}}, nil)
	if err != nil {
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
	extensionStartMtx.Lock()
	defer extensionStartMtx.Unlock()

	if PlusEnabled() {
		//log into GHCR for PLUS
		ghcrSuperdLogin()
	}

	//one broken plugin must not block the rest from starting
	failed := []string{}

	for _, entry := range config.Plugins {
		if entry.ComposeFilePath != "" && entry.Enabled == true {

			if PlusEnabled() && entry.Plus == true {
				//only plus extensions update on start for now
				if !updateExtension(entry.ComposeFilePath) {
					fmt.Println("Could not update Extension at " + entry.ComposeFilePath)
					failed = append(failed, entry.Name)
					continue
				}

				//if it is pfw we restart for fw rules to refresh after api
				if entry.Name == "PFW" {
					if !restartExtension(entry.ComposeFilePath) {
						//try a start
						if !startExtension(entry.ComposeFilePath) {
							fmt.Println("Could not start Extension at " + entry.ComposeFilePath)
							failed = append(failed, entry.Name)
							continue
						}
					}
				} else {
					if !startExtension(entry.ComposeFilePath) {
						fmt.Println("Could not start Extension at " + entry.ComposeFilePath)
						failed = append(failed, entry.Name)
						continue
					}
				}

			} else {
				if !startExtension(entry.ComposeFilePath) {
					fmt.Println("Could not start Extension at " + entry.ComposeFilePath)
					failed = append(failed, entry.Name)
					continue
				}
			}

			// Apply network capabilities after plugin is started
			applyPluginNetworkCapabilitiesRetry(entry)

		}
	}

	if len(failed) > 0 {
		return errors.New("failed to start extensions: " + strings.Join(failed, ", "))
	}
	return nil
}

// Proxy a PUT to superd's privileged time-sync endpoint.
func timeSyncHandler(w http.ResponseWriter, r *http.Request) {
	c := http.Client{Transport: &http.Transport{
		Dial: func(_, _ string) (net.Conn, error) { return net.Dial("unix", SuperdSocketPath) },
	}}
	defer c.CloseIdleConnections()
	req, _ := http.NewRequest(http.MethodPut, "http://localhost/time/sync", nil)
	resp, err := c.Do(req)
	if err != nil {
		http.Error(w, err.Error(), 502)
		return
	}
	defer resp.Body.Close()
	SprbusPublish("system:time:sync", map[string]interface{}{"ip": remoteIP(r), "status": resp.StatusCode})
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

// SSH-key calls proxy to superd.
func authorizedKeysHandler(w http.ResponseWriter, r *http.Request) {
	body, _ := ioutil.ReadAll(r.Body)
	c := http.Client{Transport: &http.Transport{
		Dial: func(_, _ string) (net.Conn, error) { return net.Dial("unix", SuperdSocketPath) },
	}}
	defer c.CloseIdleConnections()
	req, _ := http.NewRequest(r.Method, "http://localhost/authorizedKeys", bytes.NewReader(body))
	resp, err := c.Do(req)
	if err != nil {
		http.Error(w, err.Error(), 502)
		return
	}
	defer resp.Body.Close()
	if r.Method == http.MethodPut {
		var keys []string
		_ = json.Unmarshal(body, &keys)
		event := map[string]interface{}{"ip": remoteIP(r), "count": len(keys), "status": resp.StatusCode}
		topic := "ssh:authorized_keys:added"
		if resp.StatusCode != 200 {
			topic = "ssh:authorized_keys:rejected"
		}
		SprbusPublish(topic, event)
	}
	w.Header().Set("Content-Type", resp.Header.Get("Content-Type"))
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
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

func deleteDNSBucketForIP(ip string) {
	if ip == "" {
		return
	}

	go func() {
		c := http.Client{
			Timeout: 5 * time.Second,
			Transport: &http.Transport{
				Dial: func(network, addr string) (net.Conn, error) {
					return net.DialTimeout("unix", DbSocketPath, 2*time.Second)
				},
			},
		}
		defer c.CloseIdleConnections()

		req, err := http.NewRequest(http.MethodDelete, "http://localhost/bucket/dns:serve:"+ip, nil)
		if err != nil {
			return
		}

		resp, err := c.Do(req)
		if err != nil {
			log.Println("[-] dns bucket cleanup failed for", ip, ":", err)
			return
		}
		defer resp.Body.Close()
		_, _ = ioutil.ReadAll(resp.Body)
	}()
}

func callWireguardDown() {
	c := http.Client{
		Timeout: 5 * time.Second,
		Transport: &http.Transport{
			Dial: func(network, addr string) (net.Conn, error) {
				return net.DialTimeout("unix", WireguardSocketPath, 2*time.Second)
			},
		},
	}
	defer c.CloseIdleConnections()

	req, err := http.NewRequest(http.MethodPut, "http://localhost/down", nil)
	if err != nil {
		return
	}

	resp, err := c.Do(req)
	if err != nil {
		log.Println("[-] wireguard down failed:", err)
		return
	}
	defer resp.Body.Close()
	_, _ = ioutil.ReadAll(resp.Body)
}

// docker ps can infer service status
func callSuperdDockerPS(composePath string, target string) string {
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

	req, err := http.NewRequest(http.MethodGet, "http://localhost/docker_ps"+append, nil)
	if err != nil {
		return ""
	}

	resp, err := c.Do(req)
	if err != nil {
		return ""
	}

	defer resp.Body.Close()
	outString := ""
	err = json.NewDecoder(resp.Body).Decode(&outString)
	if err == nil {
		return outString
	}
	return ""
}

func dockerPS(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")

	//restart all containers
	out := callSuperdDockerPS(compose, target)
	if out == "" {
		http.Error(w, "Not found", 404)
	} else {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(out)
	}

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

func deauthConnectedStation(MAC string) {
	devices := getDevicesJson()
	device, exists := devices[MAC]
	if exists {
		established_route_device := getRouteInterface(device.RecentIP)
		if isAPVlan(established_route_device) {
			//okay, now we want to send a deauth command to this AP
			parts := strings.Split(established_route_device, ".")
			if len(parts) == 2 {
				iface := parts[0]
				RunHostapdCommandArray(iface, []string{"disassociate", MAC})
				RunHostapdCommandArray(iface, []string{"deauthenticate", MAC})
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
		deauthConnectedStation(event.MAC)
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

// StationInfo represents the parsed hostapd station information
type StationInfo map[string]string

// LeafStations represents all stations from a leaf router
type LeafStations struct {
	LeafIP   string
	Stations map[string]StationInfo // MAC -> station info
	Error    error
}

// fetchAllLeafStations fetches station information from all leaf routers via mesh plugin
func fetchAllLeafStations() (map[string]LeafStations, error) {
	if !PlusEnabled() {
		return nil, nil
	}

	if !PluginEnabled("MESH") {
		return nil, nil
	}

	req, err := http.NewRequest(http.MethodGet, "http://localhost/allLeafStations", nil)
	if err != nil {
		return nil, err
	}

	c := getMeshdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println("meshd request failed", err, "allLeafStations")
		return nil, err
	}

	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fmt.Println("meshd request failed", resp.StatusCode, "allLeafStations")
		return nil, fmt.Errorf("meshd request failed with status %d", resp.StatusCode)
	}

	var result map[string]LeafStations
	err = json.NewDecoder(resp.Body).Decode(&result)
	if err != nil {
		return nil, err
	}

	return result, nil
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

func getRepoName(gitURL string) string {
	trimmedURL := strings.TrimSuffix(gitURL, ".git")
	repoName := filepath.Base(trimmedURL)
	if strings.Contains(repoName, "..") {
		return ""
	}
	return repoName
}

// Given a git URL, install a plugin. must be OTP auth'd.
func installUserPluginGitUrl(router *mux.Router, router_public *mux.Router) func(http.ResponseWriter, *http.Request) {
	return applyJwtOtpCheck(func(w http.ResponseWriter, r *http.Request) {
		Configmtx.Lock()
		defer Configmtx.Unlock()

		url := ""
		err := json.NewDecoder(r.Body).Decode(&url)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		repo := getRepoName(url)
		if repo == "" {
			http.Error(w, "Invalid url "+url, 400)
			return
		}

		//1. Git clone it to plugins/user/<>
		success := downloadUserExtension(url, true)
		if !success {
			http.Error(w, "Failed to install plugin", 400)
			return
		}

		//2. save and update routes
		saveConfigLocked()
		PluginRoutes(router, router_public)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(config.Plugins)
	})
}

// Phase 1: Download plugin and return permissions info
func downloadUserPluginInfo(w http.ResponseWriter, r *http.Request) {
	gitURL := ""
	err := json.NewDecoder(r.Body).Decode(&gitURL)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	// Download the plugin without auto-config
	success := downloadUserExtension(gitURL, false)
	if !success {
		http.Error(w, "Failed to download plugin", 400)
		return
	}

	// Read the plugin.json from the downloaded plugin
	params := url.Values{}
	params.Set("git_url", gitURL)
	creds := GitOptions{"", "", false, false}
	jsonValue, _ := json.Marshal(creds)

	data, err := superdRequest("get_plugin_config", params, bytes.NewBuffer(jsonValue))
	if err != nil {
		http.Error(w, "Failed to read plugin configuration", 400)
		return
	}

	plugin := PluginConfig{}
	err = json.Unmarshal(data, &plugin)
	if err != nil {
		http.Error(w, "Invalid plugin configuration", 400)
		return
	}

	// Override GitURL to match what was requested
	plugin.GitURL = gitURL

	// Return plugin info with permissions
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(plugin)
}

// Phase 2: Complete plugin installation after user confirms permissions
func completeUserPluginInstall(router *mux.Router, router_public *mux.Router) func(http.ResponseWriter, *http.Request) {
	return applyJwtOtpCheck(func(w http.ResponseWriter, r *http.Request) {
		plugin := PluginConfig{}
		err := json.NewDecoder(r.Body).Decode(&plugin)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		Configmtx.Lock()
		defer Configmtx.Unlock()

		// Install the plugin configuration
		success := installUserPluginConfig(plugin)
		if !success {
			http.Error(w, "Failed to install plugin", 400)
			return
		}

		// Save and update routes
		saveConfigLocked()
		PluginRoutes(router, router_public)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(config.Plugins)
	})
}

func installUserPluginConfig(plugin PluginConfig) bool {

	//should not be a Plus module
	if plugin.Plus != false {
		return false
	}

	found := false
	idx := -1
	oldComposeFilePath := plugin.ComposeFilePath
	for idx_, entry := range config.Plugins {
		idx = idx_
		if entry.Name == plugin.Name {
			found = true
			oldComposeFilePath = entry.ComposeFilePath
			break
		}
	}

	if !found {
		config.Plugins = append(config.Plugins, plugin)
	} else {
		if plugin.Enabled == false {
			//plugin is on longer enabled, send stop
			stopExtension(oldComposeFilePath)
		}
		config.Plugins[idx] = plugin
	}

	if plugin.InstallTokenPath != "" {
		cleanPath := filepath.Clean(plugin.InstallTokenPath)
		if !strings.HasPrefix(cleanPath, "/configs/plugins/") {
			log.Println("invalid InstallTokenPath")
			SprbusPublish("plugin:install:failure", map[string]string{"Name": plugin.Name, "GitURL": plugin.GitURL, "Reason": "Invalid InstallTokenPath, must start with /configs/plugins/"})
		} else {
			token, err := generateOrGetToken(plugin.Name+"-install-token", plugin.ScopedPaths)
			if err == nil {
				err = os.MkdirAll(filepath.Dir(cleanPath), os.ModePerm)
				if err != nil {
					SprbusPublish("plugin:install:failure", map[string]string{"Name": plugin.Name, "GitURL": plugin.GitURL, "Reason": "Failed to make path for API token for plugin"})
				}
				err = ioutil.WriteFile(plugin.InstallTokenPath, []byte(token.Token), 0600)
				if err == nil {
					SprbusPublish("plugin:install:status", map[string]string{"Name": plugin.Name, "GitURL": plugin.GitURL, "Reason": "Installed API token"})
				} else {
					SprbusPublish("plugin:install:failure", map[string]string{"Name": plugin.Name, "GitURL": plugin.GitURL, "Reason": "Failed to write API token for plugin"})
				}
			} else {
				log.Println("Failed to generate token for plugin")
				SprbusPublish("plugin:install:failure", map[string]string{"Name": plugin.Name, "GitURL": plugin.GitURL, "Reason": "Failed to generate API token for plugin"})
			}
		}

	}

	// update custom compose allow list
	curList := []string{}
	data, err := ioutil.ReadFile(CustomComposeAllowPath)
	if err == nil {
		_ = json.Unmarshal(data, &curList)

		for _, entry := range curList {
			if entry == plugin.ComposeFilePath {
				SprbusPublish("plugin:install:status", map[string]string{"GitURL": plugin.GitURL, "Reason": "Already in compose whitelist"})
				return true
			}
		}
	}

	//add ComposeFilePath to whitelist
	curList = append(curList, plugin.ComposeFilePath)
	file, _ := json.MarshalIndent(curList, "", " ")
	err = ioutil.WriteFile(CustomComposeAllowPath, file, 0600)
	if err != nil {
		log.Println("failed to write custom compose paths configuration", err)
		SprbusPublish("plugin:install:failure", map[string]string{"GitURL": plugin.GitURL, "Reason": "Failed to add compose file to whitelist"})
	}

	SprbusPublish("plugin:install:status", map[string]string{"GitURL": plugin.GitURL, "Reason": "Added to compose whitelist"})
	return true
}

// for future consideration
func WebSocketPluginHandler(config PluginConfig) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {

		// Perform the WebSocket upgrade
		var upgrader = websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin:     func(r *http.Request) bool { return true },
		}
		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer c.Close()

		//for the plugin proxy, we dont check otp
		if !authWebsocket(r, c, true) {
			return
		}

		rest := mux.Vars(r)["rest"]
		targetURL := "ws://127.0.0.1/" + rest

		dialer := websocket.Dialer{
			NetDial: func(network, addr string) (net.Conn, error) {
				return net.Dial("unix", config.UnixPath)
			},
		}

		// Perform the WebSocket handshake with the target
		targetConn, _, err := dialer.Dial(targetURL, nil)
		if err != nil {
			c.WriteMessage(websocket.TextMessage, []byte("Failed to connect to plugin"))
			return
		}
		defer targetConn.Close()

		// Start proxying WebSocket messages
		errc := make(chan error, 2)
		go proxyWebSocket(targetConn, c, errc)
		go proxyWebSocket(c, targetConn, errc)
		<-errc
	}
}

func proxyWebSocket(dst, src *websocket.Conn, errc chan error) {
	for {
		messageType, p, err := src.ReadMessage()
		if err != nil {
			errc <- err
			return
		}
		err = dst.WriteMessage(messageType, p)
		if err != nil {
			errc <- err
			return
		}
	}
}
