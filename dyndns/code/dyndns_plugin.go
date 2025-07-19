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

var (
	configMutex  sync.RWMutex
	godnsManager *GodnsManager

	TEST_PREFIX          = ""
	UNIX_PLUGIN_LISTENER = TEST_PREFIX + "/state/plugins/dyndns/dyndns_plugin"
	GoDyndnsConfigFile   = TEST_PREFIX + "/configs/dyndns/godyndns.json"
)

// GodnsManager handles all godns process management
type GodnsManager struct {
	mu              sync.Mutex
	process         *exec.Cmd
	proxy           *httputil.ReverseProxy
	isRunning       bool
	webPanelEnabled bool
}

func NewGodnsManager() *GodnsManager {
	return &GodnsManager{}
}

// Start godns based on current mode (web panel or one-shot)
func (gm *GodnsManager) Start(config GodyndnsConfig) {
	gm.mu.Lock()
	defer gm.mu.Unlock()

	if config.Provider == "" {
		fmt.Println("godns: no provider configured, not starting")
		return
	}

	// Stop any existing process
	gm.stopInternal()

	if config.WebPanel.Enabled {
		gm.startWebPanel(config)
	} else {
		// For one-shot mode, just run it
		go gm.runOneShot()
	}
}

// Run godns once (for manual refresh or timer)
func (gm *GodnsManager) RunOnce() {
	config := loadConfig()
	if config.Provider == "" {
		return
	}

	if config.WebPanel.Enabled {
		// If web panel is enabled, godns is already running
		return
	}

	// Run in background to not block
	go gm.runOneShot()
}

func (gm *GodnsManager) runOneShot() {
	cmd := exec.Command("/godns", "-c", GoDyndnsConfigFile)
	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("godns error: %v\nOutput: %s\n", err, output)
	} else {
		fmt.Printf("godns output: %s\n", output)
	}
}

func (gm *GodnsManager) startWebPanel(config GodyndnsConfig) {
	gm.process = exec.Command("/godns", "-c", GoDyndnsConfigFile)
	gm.process.Stdout = os.Stdout
	gm.process.Stderr = os.Stderr

	if err := gm.process.Start(); err != nil {
		fmt.Printf("godns failed to start: %v\n", err)
		return
	}

	fmt.Printf("godns started with PID: %d\n", gm.process.Process.Pid)
	gm.isRunning = true
	gm.webPanelEnabled = true

	// Setup proxy after giving godns time to start
	time.Sleep(2 * time.Second)

	if config.WebPanel.Addr != "" {
		target, err := url.Parse("http://" + config.WebPanel.Addr)
		if err == nil {
			gm.proxy = httputil.NewSingleHostReverseProxy(target)
			gm.proxy.ModifyResponse = modifyProxyResponse
			fmt.Printf("godns web panel proxy configured for %v\n", target)
		}
	}
}

func (gm *GodnsManager) Stop() {
	gm.mu.Lock()
	defer gm.mu.Unlock()
	gm.stopInternal()
}

func (gm *GodnsManager) stopInternal() {
	if gm.process != nil && gm.process.Process != nil {
		gm.process.Process.Kill()
		gm.process.Wait()
		gm.process = nil
	}
	gm.proxy = nil
	gm.isRunning = false
	gm.webPanelEnabled = false
}

func (gm *GodnsManager) GetProxy() *httputil.ReverseProxy {
	gm.mu.Lock()
	defer gm.mu.Unlock()
	return gm.proxy
}

// Proxy response modifier to fix paths
func modifyProxyResponse(resp *http.Response) error {
	contentType := resp.Header.Get("Content-Type")
	if strings.Contains(contentType, "text/html") {
		bodyBytes, err := ioutil.ReadAll(resp.Body)
		if err != nil {
			return err
		}
		resp.Body.Close()

		bodyStr := string(bodyBytes)
		
		// Inject base tag to help with relative URLs
		baseTag := `<base href="/plugins/dyndns/">`
		bodyStr = strings.Replace(bodyStr, "<head>", "<head>\n" + baseTag, 1)
		
		// Also inject a script to set the proper base URL for the app
		baseScript := `<script>
			// Set base URL for Next.js app
			window.__NEXT_ROUTER_BASEPATH = '/plugins/dyndns';
			window.__NEXT_ASSET_PREFIX = '/admin/custom_plugin/dyndns/static';
			
			// Override fetch to handle API calls correctly
			(function() {
				const origFetch = window.fetch;
				window.fetch = function(url, options) {
					// If it's a relative URL, prepend our base
					if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('/plugins/') && !url.startsWith('/admin/')) {
						url = '/plugins/dyndns' + url;
					}
					return origFetch(url, options);
				};
			})();
		</script>`
		bodyStr = strings.Replace(bodyStr, "</head>", baseScript + "\n</head>", 1)
		
		// Rewrite paths to use the public static route
		bodyStr = strings.ReplaceAll(bodyStr, `href="/_next/`, `href="/admin/custom_plugin/dyndns/static/_next/`)
		bodyStr = strings.ReplaceAll(bodyStr, `src="/_next/`, `src="/admin/custom_plugin/dyndns/static/_next/`)
		bodyStr = strings.ReplaceAll(bodyStr, `"/_next/`, `"/admin/custom_plugin/dyndns/static/_next/`)
		bodyStr = strings.ReplaceAll(bodyStr, `'/_next/`, `'/admin/custom_plugin/dyndns/static/_next/`)

		bodyBytes = []byte(bodyStr)
		resp.Body = ioutil.NopCloser(strings.NewReader(bodyStr))
		resp.ContentLength = int64(len(bodyBytes))
		resp.Header.Set("Content-Length", fmt.Sprintf("%d", len(bodyBytes)))
	}

	if location := resp.Header.Get("Location"); location != "" {
		if strings.HasPrefix(location, "/") {
			resp.Header.Set("Location", "/plugins/dyndns"+location)
		}
	}

	return nil
}

// Config structures
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
	IpUrl       string           `json:"ip_url"`   //deprecated
	Ipv6Url     string           `json:"ipv6_url"` //deprecated
	IpType      string           `json:"ip_type"`
	Interval    int              `json:"interval"`
	Socks5Proxy string           `json:"socks5"`
	Resolver    string           `json:"resolver"`
	RunOnce     bool             `json:"run_once"`
	WebPanel    WebPanelConfig   `json:"web_panel,omitempty"`
}

type WebPanelConfig struct {
	Enabled  bool   `json:"enabled"`
	Addr     string `json:"addr"`
	Username string `json:"username"`
	Password string `json:"password"`
}

// API config without internal fields
type GodyndnsConfigAPI struct {
	Provider    string           `json:"provider"`
	Email       string           `json:"email"`
	Password    string           `json:"password"`
	LoginToken  string           `json:"login_token"`
	Domains     []GodyndnsDomain `json:"domains"`
	IpUrls      []string         `json:"ip_urls"`
	IpUrl       string           `json:"ip_url"`
	Ipv6Url     string           `json:"ipv6_url"`
	IpType      string           `json:"ip_type"`
	Interval    int              `json:"interval"`
	Socks5Proxy string           `json:"socks5"`
	Resolver    string           `json:"resolver"`
	RunOnce     bool             `json:"run_once"`
}

// Config management
func loadConfig() GodyndnsConfig {
	configMutex.RLock()
	defer configMutex.RUnlock()

	config := GodyndnsConfig{}
	data, err := ioutil.ReadFile(GoDyndnsConfigFile)
	if err != nil {
		return config
	}

	json.Unmarshal(data, &config)
	return config
}

func saveConfig(config GodyndnsConfig) error {
	configMutex.Lock()
	defer configMutex.Unlock()

	data, err := json.Marshal(config)
	if err != nil {
		return err
	}

	return ioutil.WriteFile(GoDyndnsConfigFile, data, 0600)
}

// HTTP Handlers
func getConfiguration(w http.ResponseWriter, r *http.Request) {
	config := loadConfig()

	// Convert to API version (hide web panel)
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

func setConfiguration(w http.ResponseWriter, r *http.Request) {
	var apiConfig GodyndnsConfigAPI
	if err := json.NewDecoder(r.Body).Decode(&apiConfig); err != nil {
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

	if err := validateConfig(config); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	// Set web panel based on provider
	if config.Provider != "" {
		config.WebPanel.Enabled = true
		config.WebPanel.Addr = "127.0.0.1:9876"
		config.WebPanel.Username = "admin"
		config.WebPanel.Password = "dyndns"
		config.RunOnce = false
	} else {
		config.WebPanel.Enabled = false
		config.RunOnce = true
	}

	if err := saveConfig(config); err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	// Restart godns with new config
	godnsManager.Start(config)
}

func refreshDyndns(w http.ResponseWriter, r *http.Request) {
	godnsManager.RunOnce()
	w.WriteHeader(http.StatusOK)
}

func handleStaticProxy(w http.ResponseWriter, r *http.Request) {
	proxy := godnsManager.GetProxy()
	if proxy == nil {
		http.Error(w, "Service not ready", 503)
		return
	}

	// Remove /static prefix and restore original path
	r.URL.Path = strings.TrimPrefix(r.URL.Path, "/static")
	proxy.ServeHTTP(w, r)
}

func handleUIProxy(w http.ResponseWriter, r *http.Request) {
	config := loadConfig()

	if config.Provider == "" {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprintf(w, `
			<html>
			<body>
				<h1>GoDNS Dynamic DNS Plugin</h1>
				<p>No DNS provider configured yet.</p>
				<p>Please configure the plugin using the SPR UI first.</p>
			</body>
			</html>
		`)
		return
	}

	// Ensure godns is running with web panel
	if !config.WebPanel.Enabled {
		config.WebPanel.Enabled = true
		config.WebPanel.Addr = "127.0.0.1:9876"
		config.WebPanel.Username = "admin"
		config.WebPanel.Password = "dyndns"
		config.RunOnce = false

		saveConfig(config)
		godnsManager.Start(config)
		time.Sleep(3 * time.Second)
	}

	proxy := godnsManager.GetProxy()
	if proxy == nil {
		http.Error(w, "Web panel is starting, please refresh in a few seconds", 503)
		return
	}

	proxy.ServeHTTP(w, r)
}

// Validation
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

// Utilities
func getInterval() time.Duration {
	config := loadConfig()
	if config.Interval == 0 {
		return 300 * time.Second
	}
	return time.Duration(config.Interval) * time.Second
}

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("DEBUGHTTP") != "" {
			fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		}
		handler.ServeHTTP(w, r)
	})
}

// Background timer
func startIntervalTimer() {
	go func() {
		ticker := time.NewTicker(getInterval())
		for range ticker.C {
			godnsManager.RunOnce()
		}
	}()
}

// Migration
func migrateIpUrls() {
	config := loadConfig()

	if len(config.IpUrls) == 0 {
		urls := []string{}
		if config.IpUrl != "" {
			urls = append(urls, config.IpUrl)
		}
		if config.Ipv6Url != "" {
			urls = append(urls, config.Ipv6Url)
		}
		if len(urls) > 0 {
			config.IpUrls = urls
			config.RunOnce = true
			saveConfig(config)
		}
	}
}

func main() {
	// Initialize
	godnsManager = NewGodnsManager()
	migrateIpUrls()

	// Setup routes
	router := mux.NewRouter().StrictSlash(true)
	router.HandleFunc("/config", getConfiguration).Methods("GET")
	router.HandleFunc("/config", setConfiguration).Methods("PUT")
	router.HandleFunc("/refresh", refreshDyndns).Methods("GET")

	// Handle static files (from SPR's public route)
	router.PathPrefix("/static/").HandlerFunc(handleStaticProxy)

	// Catch-all for UI
	router.PathPrefix("/").HandlerFunc(handleUIProxy)

	// Setup Unix socket
	os.Remove(UNIX_PLUGIN_LISTENER)
	listener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}

	// Start timer
	startIntervalTimer()

	// Start godns if configured
	config := loadConfig()
	if config.Provider != "" {
		godnsManager.Start(config)
	}

	// Cleanup on exit
	defer godnsManager.Stop()

	// Serve
	server := http.Server{Handler: logRequest(router)}
	server.Serve(listener)
}
