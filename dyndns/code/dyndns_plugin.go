package main

import (
	"encoding/json"
//	"errors"
	"fmt"
//	"io"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"os/exec"
//	"strconv"
//	"strings"
	"time"
	"sync"
)

import (
	"github.com/gorilla/mux"
)


var UNIX_PLUGIN_LISTENER = "/state/dyndns/dynds_plugin"

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
	_, err := cmd.Output()
	if err != nil {
		fmt.Println("godns failed to run", err)
	}
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
	data, err := ioutil.ReadFile(GoDyndnsConfigFile)
	if err != nil {
		fmt.Println("failed to read config file:", err)
		http.Error(w, "Not found", 404)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(string(data))
}


func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		handler.ServeHTTP(w, r)
	})
}

func startIntervalTimer() {
	runTimer := func() {
		// is it worth reading the configuration file for the interval?
		ticker := time.NewTicker(5 * time.Minute)
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
