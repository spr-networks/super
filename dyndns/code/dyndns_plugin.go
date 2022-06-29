package main

import (
	"encoding/json"
	"regexp"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"os/exec"
	"time"
	"sync"
)

import (
	"github.com/gorilla/mux"
)

var UNIX_PLUGIN_LISTENER = "/state/plugins/dyndns/dyndns_plugin"

var Configmtx sync.Mutex
var TEST_PREFIX = ""
var GoDyndnsConfigFile = TEST_PREFIX + "/configs/dyndns/godyndns.json"

type GodyndnsDomain struct {
	DomainName	string `json:"domain_name"`
	SubDomains []string `json:"sub_domains"`
}
type GodyndnsConfig struct {
	Provider 		string			`json:"provider"`
	Email				string			`json:"email"`
	Password 		string			`json:"password"`
	LoginToken 	string			`json:"login_token"`
	Domains			[]GodyndnsDomain	`json:"domains"`
	IpUrl				string			`json:"ip_url"`
	Ipv6Url			string			`json:"ipv6_url"`
	IpType			string			`json:"ip_type"`
	Interval		int					`json:"interval"`
	Socks5Proxy	string			`json:"socks5"`
	Resolver		string			`json:"resolver"`
	RunOnce			bool				`json:"run_once"`
}

func runGoDyndns() {
	cmd := exec.Command("/godns", "-c", GoDyndnsConfigFile)
	stdout, err := cmd.Output()
	if err != nil {
		fmt.Println("godns failed to run", err)
	}
	fmt.Println("out",string(stdout))
}

func validateConfig(config GodyndnsConfig) error {

	validCommand := regexp.MustCompile(`^[:/\-=@A-Za-z0-9.]+$`).MatchString
	if !validCommand(config.Provider) {
		return fmt.Errorf("invalid provider")
	}

	if config.Email != "" && !validCommand(config.Email) {
		return fmt.Errorf("invalid email")
	}


	if config.IpUrl != "" && !validCommand(config.IpUrl) {
		return fmt.Errorf("invalid IpUrl")
	}

	if config.Ipv6Url != "" && !validCommand(config.Ipv6Url) {
		return fmt.Errorf("invalid Ipv6Url")
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
		if entry.DomainName != "" && !validCommand(entry.DomainName){
			return fmt.Errorf("invalid domain name: " + entry.DomainName)
		}
		for _, subdomain := range entry.SubDomains {
			if subdomain != "" && !validCommand(subdomain){
				return fmt.Errorf("invalid subdomain: " + subdomain)
			}
		}
	}

	return nil
}

func setConfiguration(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	config := GodyndnsConfig{}
	err := json.NewDecoder(r.Body).Decode(&config)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	fmt.Println(config)
	err = validateConfig(config)
	if err != nil {
		http.Error(w, err.Error(), 400)
	}

	//we use godns in run once mode
	//alternatively could patch it to support reloading the configuration file.
	//more effectively
	config.RunOnce = true

	data, _ := json.Marshal(config)

	err = ioutil.WriteFile(GoDyndnsConfigFile, data, 0600)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	runGoDyndns()
}

func refreshDyndns(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	runGoDyndns()
}


func getConfiguration(w http.ResponseWriter, r *http.Request) {
	config := loadConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
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
		fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		handler.ServeHTTP(w, r)
	})
}

func startIntervalTimer() {
	runTimer := func() {
		ticker := time.NewTicker(getInterval())
		for {
			select {
			case <-ticker.C:

				Configmtx.Lock()
				runGoDyndns()
				Configmtx.Unlock()

			}
		}
	}

	go runTimer()

}

func main() {
	unix_plugin_router := mux.NewRouter().StrictSlash(true)

	unix_plugin_router.HandleFunc("/config", getConfiguration).Methods("GET")
	unix_plugin_router.HandleFunc("/config", setConfiguration).Methods("PUT")
	unix_plugin_router.HandleFunc("/refresh", refreshDyndns).Methods("GET")

	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}

	startIntervalTimer()

	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

	pluginServer.Serve(unixPluginListener)
}
