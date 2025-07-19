package main

import (
	"encoding/json"
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
	"sync"
	"time"
)

import (
	"github.com/gorilla/mux"
)

var Configmtx sync.Mutex
var TEST_PREFIX = ""
var UNIX_PLUGIN_LISTENER = TEST_PREFIX + "/state/plugins/dyndns/dyndns_plugin"
var GoDyndnsConfigFile = TEST_PREFIX + "/configs/dyndns/godyndns.json"
var godnsProcess *exec.Cmd
var godnsProxy *httputil.ReverseProxy

type GodyndnsDomain struct {
	DomainName string   `json:"domain_name"`
	SubDomains []string `json:"sub_domains"`
}
type GodyndnsConfig struct {
	Provider    string           `json:"provider"`
	Email       string           `json:"email"`
	Password    string           `json:"password"`
	LoginToken  string           `json:"login_token"`
	Domains     []GodyndnsDomain `json:"domains"`
	IpUrls      []string         `json:"ip_urls"`
	IpUrl       string           `json:"ip_url"`   //deprecated entry, replaced by ip_urls
	Ipv6Url     string           `json:"ipv6_url"` //deprecated entry, replaced by ip_urls
	IpType      string           `json:"ip_type"`
	Interval    int              `json:"interval"`
	Socks5Proxy string           `json:"socks5"`
	Resolver    string           `json:"resolver"`
	RunOnce     bool             `json:"run_once"`
	WebPanel    WebPanelConfig   `json:"web_panel,omitempty"` // Internal use only
}

type WebPanelConfig struct {
	Enabled  bool   `json:"enabled"`
	Addr     string `json:"addr"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// GodyndnsConfigAPI is the config exposed to the API (without internal fields)
type GodyndnsConfigAPI struct {
	Provider    string           `json:"provider"`
	Email       string           `json:"email"`
	Password    string           `json:"password"`
	LoginToken  string           `json:"login_token"`
	Domains     []GodyndnsDomain `json:"domains"`
	IpUrls      []string         `json:"ip_urls"`
	IpUrl       string           `json:"ip_url"`   //deprecated entry, replaced by ip_urls
	Ipv6Url     string           `json:"ipv6_url"` //deprecated entry, replaced by ip_urls
	IpType      string           `json:"ip_type"`
	Interval    int              `json:"interval"`
	Socks5Proxy string           `json:"socks5"`
	Resolver    string           `json:"resolver"`
	RunOnce     bool             `json:"run_once"`
}

func startGoDyndns() {
	stopGoDyndns()

	config := loadConfig()
	if config.Provider == "" {
		// Don't start if no provider is configured
		fmt.Println("godns not started: no provider configured")
		return
	}

	godnsProcess = exec.Command("/godns", "-c", GoDyndnsConfigFile)
	godnsProcess.Stdout = os.Stdout
	godnsProcess.Stderr = os.Stderr

	if err := godnsProcess.Start(); err != nil {
		fmt.Println("godns failed to start", err)
		return
	}

	fmt.Println("godns started with PID:", godnsProcess.Process.Pid)

	// Setup proxy with path rewriting
	if config.WebPanel.Enabled && config.WebPanel.Addr != "" {
		time.Sleep(2 * time.Second)

		target, err := url.Parse("http://" + config.WebPanel.Addr)
		if err == nil {
			godnsProxy = httputil.NewSingleHostReverseProxy(target)
			godnsProxy.ModifyResponse = func(resp *http.Response) error {
				// Only rewrite HTML responses
				contentType := resp.Header.Get("Content-Type")
				if strings.Contains(contentType, "text/html") {
					// Read the body
					bodyBytes, err := ioutil.ReadAll(resp.Body)
					if err != nil {
						return err
					}
					resp.Body.Close()

					// Rewrite paths
					bodyStr := string(bodyBytes)
					bodyStr = strings.ReplaceAll(bodyStr, `href="/_next/`, `href="/plugins/dyndns/_next/`)
					bodyStr = strings.ReplaceAll(bodyStr, `src="/_next/`, `src="/plugins/dyndns/_next/`)
					bodyStr = strings.ReplaceAll(bodyStr, `"/_next/`, `"/plugins/dyndns/_next/`)
					bodyStr = strings.ReplaceAll(bodyStr, `'/_next/`, `'/plugins/dyndns/_next/`)

					// Update content length
					bodyBytes = []byte(bodyStr)
					resp.Body = ioutil.NopCloser(strings.NewReader(bodyStr))
					resp.ContentLength = int64(len(bodyBytes))
					resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(bodyBytes)))
				}

				// Rewrite Location headers for redirects
				if location := resp.Header.Get("Location"); location != "" {
					if strings.HasPrefix(location, "/") {
						resp.Header.Set("Location", "/plugins/dyndns"+location)
					}
				}

				return nil
			}
			fmt.Println("godns web panel proxy configured for", target)
		}
	}
}

func stopGoDyndns() {
	if godnsProcess != nil && godnsProcess.Process != nil {
		godnsProcess.Process.Kill()
		godnsProcess.Wait()
		godnsProcess = nil
	}
	godnsProxy = nil
}

func runGoDyndns() {
	// For backward compatibility, run once mode
	config := loadConfig()
	if config.Provider == "" {
		// Don't run if no provider is configured
		return
	}

	cmd := exec.Command("/godns", "-c", GoDyndnsConfigFile)
	stdout, err := cmd.Output()
	if err != nil {
		fmt.Println("godns failed to run", err)
	}
	fmt.Println("out", string(stdout))
}

func validateConfig(config GodyndnsConfig) error {

	validCommand := regexp.MustCompile(`^[:/\-=@A-Za-z0-9.]+$`).MatchString
	if !validCommand(config.Provider) {
		return fmt.Errorf("invalid provider")
	}

	if config.Email != "" && !validCommand(config.Email) {
		return fmt.Errorf("invalid email")
	}

	if len(config.IpUrls) == 0 {
		return fmt.Errorf("invalid IpUrls")
	}

	for _, url := range config.IpUrls {
		if !validCommand(url) {
			return fmt.Errorf("invalid IpUrl: " + url)
		}
	}

	if config.IpType != "" && !validCommand(config.IpType) {
		return fmt.Errorf("invalid IpType")
	}

	if config.Socks5Proxy != "" {
		return fmt.Errorf("Socks5Proxy not supported")
	}

	if config.Resolver != "" && !validCommand(config.Resolver) {
		return fmt.Errorf("invalid resolver")
	}

	for _, entry := range config.Domains {
		if entry.DomainName != "" && !validCommand(entry.DomainName) {
			return fmt.Errorf("invalid domain name: " + entry.DomainName)
		}
		for _, subdomain := range entry.SubDomains {
			if subdomain != "" && !validCommand(subdomain) {
				return fmt.Errorf("invalid subdomain: " + subdomain)
			}
		}
	}

	return nil
}

func setConfiguration(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	// Decode API config
	apiConfig := GodyndnsConfigAPI{}
	err := json.NewDecoder(r.Body).Decode(&apiConfig)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	// Convert to full config
	config := GodyndnsConfig{
		Provider:    strings.Title(apiConfig.Provider),
		Email:       apiConfig.Email,
		Password:    apiConfig.Password,
		LoginToken:  apiConfig.LoginToken,
		Domains:     apiConfig.Domains,
		IpUrls:      apiConfig.IpUrls,
		IpUrl:       apiConfig.IpUrl,
		Ipv6Url:     apiConfig.Ipv6Url,
		IpType:      apiConfig.IpType,
		Interval:    apiConfig.Interval,
		Socks5Proxy: apiConfig.Socks5Proxy,
		Resolver:    apiConfig.Resolver,
		RunOnce:     apiConfig.RunOnce,
	}

	err = validateConfig(config)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	// Always enable web panel internally if provider is configured
	if config.Provider != "" {
		config.WebPanel.Enabled = true
		config.WebPanel.Addr = "127.0.0.1:9876"
		config.WebPanel.Username = "admin"
		config.WebPanel.Password = "dyndns"
		config.RunOnce = false
	} else {
		// No provider, disable web panel
		config.WebPanel.Enabled = false
		config.RunOnce = true
	}

	data, _ := json.Marshal(config)

	err = ioutil.WriteFile(GoDyndnsConfigFile, data, 0600)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if config.WebPanel.Enabled {
		startGoDyndns()
	} else {
		runGoDyndns()
	}
}

func refreshDyndns(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	runGoDyndns()
}

func getConfiguration(w http.ResponseWriter, r *http.Request) {
	config := loadConfig()

	// Convert to API version (without web panel settings)
	apiConfig := GodyndnsConfigAPI{
		Provider:    config.Provider,
		Email:       config.Email,
		Password:    config.Password,
		LoginToken:  config.LoginToken,
		Domains:     config.Domains,
		IpUrls:      config.IpUrls,
		IpUrl:       config.IpUrl,
		Ipv6Url:     config.Ipv6Url,
		IpType:      config.IpType,
		Interval:    config.Interval,
		Socks5Proxy: config.Socks5Proxy,
		Resolver:    config.Resolver,
		RunOnce:     config.RunOnce,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(apiConfig)
}

func loadConfig() GodyndnsConfig {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	config := GodyndnsConfig{}

	data, err := ioutil.ReadFile(GoDyndnsConfigFile)
	if err != nil {
		return config
	}

	err = json.Unmarshal(data, &config)
	if err != nil {
		fmt.Println(err)
	}

	return config
}

func getInterval() time.Duration {
	config := loadConfig()
	if config.Interval == 0 {
		return 300 * time.Second
	} else {
		return time.Duration(config.Interval) * time.Second
	}
}

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("DEBUGHTTP") != "" {
			fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		}
		handler.ServeHTTP(w, r)
	})
}

func startIntervalTimer() {
	runTimer := func() {
		ticker := time.NewTicker(getInterval())
		for {
			select {
			case <-ticker.C:
				config := loadConfig()
				if !config.WebPanel.Enabled {
					// Only run in interval mode if web panel is disabled
					Configmtx.Lock()
					runGoDyndns()
					Configmtx.Unlock()
				}
			}
		}
	}

	go runTimer()
}

func migrate_ip_urls() {
	//upgrade ip urls from the old format
	config := loadConfig()
	Configmtx.Lock()
	defer Configmtx.Unlock()

	if len(config.IpUrls) == 0 {
		urls := []string{}
		if config.IpUrl != "" {
			urls = append(urls, config.IpUrl)
		}
		if config.Ipv6Url != "" {
			urls = append(urls, config.Ipv6Url)
		}
		config.IpUrls = urls
		config.RunOnce = true
		data, _ := json.Marshal(config)
		err := ioutil.WriteFile(GoDyndnsConfigFile, data, 0600)
		if err != nil {
			fmt.Println("[-] Failed to save migration")
		}
	}

}

func dyndns_init() {
	migrate_ip_urls()
}

func handleUIProxy(w http.ResponseWriter, r *http.Request) {
	config := loadConfig()

	// If no provider is configured, return a message
	if config.Provider == "" {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprintf(w, `
			<html>
			<body>
				<h1>GoDNS Dynamic DNS Plugin</h1>
				<p>No DNS provider configured yet.</p>
				<p>Please configure the plugin using the SPR UI or API first.</p>
			</body>
			</html>
		`)
		return
	}

	// If web panel is not enabled, enable it automatically
	if !config.WebPanel.Enabled || godnsProxy == nil {
		config.WebPanel.Enabled = true
		config.WebPanel.Addr = "127.0.0.1:9876"
		config.WebPanel.Username = "admin"
		config.WebPanel.Password = "dyndns"
		config.RunOnce = false

		data, _ := json.Marshal(config)
		ioutil.WriteFile(GoDyndnsConfigFile, data, 0600)

		go startGoDyndns()
		time.Sleep(3 * time.Second)
	}

	if godnsProxy == nil {
		http.Error(w, "Web panel is starting, please refresh in a few seconds", 503)
		return
	}

	// Proxy the request
	godnsProxy.ServeHTTP(w, r)
}

func main() {

	dyndns_init()

	unix_plugin_router := mux.NewRouter().StrictSlash(true)

	unix_plugin_router.HandleFunc("/config", getConfiguration).Methods("GET")
	unix_plugin_router.HandleFunc("/config", setConfiguration).Methods("PUT")
	unix_plugin_router.HandleFunc("/refresh", refreshDyndns).Methods("GET")

	// Handle all other requests as UI proxy
	unix_plugin_router.PathPrefix("/").HandlerFunc(handleUIProxy)

	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}

	startIntervalTimer()

	// Start godns if web panel is enabled
	config := loadConfig()
	if config.WebPanel.Enabled {
		go startGoDyndns()
	}

	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

	// Cleanup on exit
	defer stopGoDyndns()

	pluginServer.Serve(unixPluginListener)
}
