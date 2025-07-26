package main

import (
	"bytes"
	crand "crypto/rand"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	logStd "log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/spr-networks/sprbus"
)

var TEST_PREFIX = os.Getenv("TEST_PREFIX")
var ApiConfigPath = TEST_PREFIX + "/configs/base/api.json"
var SetupDonePath = TEST_PREFIX + "/configs/base/.setup_done"
var HostnameConfigPath = TEST_PREFIX + "/configs/base/hostname"

var DevicesConfigPath = TEST_PREFIX + "/configs/devices/"
var DevicesConfigFile = DevicesConfigPath + "devices.json"
var DevicesPublicConfigFile = TEST_PREFIX + "/state/public/devices-public.json"
var PublicIfaceMapFile = TEST_PREFIX + "/state/public/ip-iface-map.json"
var ConfigBackupDirectory = TEST_PREFIX + "/state/backups"

var GroupsConfigFile = DevicesConfigPath + "groups.json"

var ConfigFile = TEST_PREFIX + "/configs/base/config.sh"
var DNSConfigFile = TEST_PREFIX + "/configs/dns/Corefile"
var MulticastConfigFile = TEST_PREFIX + "/configs/base/multicast.json"

var ApiTlsCert = TEST_PREFIX + "/configs/auth/www-api.crt"
var ApiTlsCaCert = TEST_PREFIX + "/configs/auth/cert/www-api-ca.crt"
var ApiTlsKey = TEST_PREFIX + "/configs/auth/www-api.key"

var SuperdSocketPath = TEST_PREFIX + "/state/plugins/superd/socket"

// NOTE .Fire will dial, print to stdout/stderr if sprbus not started
var log = sprbus.NewLog("log:api")

var gSprbusClient *sprbus.Client

type InfluxConfig struct {
	URL    string
	Org    string
	Bucket string
	Token  string
}

type MulticastAddress struct {
	Address  string //adderss:port pair
	Disabled bool
	Tags     []string
}

type MulticastSettings struct {
	Disabled             bool
	Addresses            []MulticastAddress
	DisableMDNSAdvertise bool
	MDNSName             string
}

type APIConfig struct {
	InfluxDB        InfluxConfig
	Plugins         []PluginConfig
	PlusToken       string
	AutoUpdate      bool //unused
	CheckUpdates    bool
	ReportInstall   bool
	ReportedInstall bool
	DNS             DNSSettings
}

type GroupEntry struct {
	Name     string
	Disabled bool
	//tags that belong to a group
	GroupTags []string
	//Services that belong to a group
	ServiceDestinations []string
}

type PSKEntry struct {
	Type string
	Psk  string
}

type DeviceStyle struct {
	Icon  string
	Color string
}

type DeviceEntry struct {
	Name             string
	MAC              string
	WGPubKey         string
	VLANTag          string
	RecentIP         string
	DNSCustom        string
	PSKEntry         PSKEntry
	Policies         []string
	Groups           []string
	DeviceTags       []string
	DHCPFirstTime    string
	DHCPLastTime     string
	Style            DeviceStyle
	DeviceExpiration int64
	DeleteExpiration bool
	DeviceDisabled   bool //tbd deprecate this in favor of only using the policy name.
}

var ValidPolicyStrings = []string{"wan", "lan", "dns", "api", "lan_upstream", "noapi", "guestonly", "disabled", "quarantine", "dns:family"}

var config = APIConfig{}

var Configmtx sync.Mutex

func loadConfig() {

	Configmtx.Lock()
	defer Configmtx.Unlock()

	data, err := ioutil.ReadFile(ApiConfigPath)
	if err != nil {
		log.Println(err)
	} else {
		err = json.Unmarshal(data, &config)
		if err != nil {
			log.Println(err)
		}
	}

	update := updateConfigPluginDefaults(&config)

	if update {
		saveConfigLocked()
	}

	//loading this will make sure devices-public.json is made
	getDevicesJson()

	initTraffic(config)
}

func saveConfigLocked() {
	file, _ := json.MarshalIndent(config, "", " ")
	err := ioutil.WriteFile(ApiConfigPath, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func saveConfig() {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	saveConfigLocked()
}

var UNIX_WIFID_LISTENER = TEST_PREFIX + "/state/wifi/apisock"
var UNIX_DHCPD_LISTENER = TEST_PREFIX + "/state/dhcp/apisock"
var UNIX_WIREGUARD_LISTENER_PATH = TEST_PREFIX + "/state/plugins/wireguard/"
var UNIX_WIREGUARD_LISTENER = UNIX_WIREGUARD_LISTENER_PATH + "apisock"

func ipAddr(w http.ResponseWriter, r *http.Request) {
	cmd := exec.Command("ip", "-j", "addr")
	stdout, err := cmd.Output()

	if err != nil {
		log.Println("ipAddr failed", err)
		http.Error(w, "Not found", 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, string(stdout))
}

func ipLinkUpDown(w http.ResponseWriter, r *http.Request) {
	iface := mux.Vars(r)["interface"]
	state := mux.Vars(r)["state"]

	if state != "up" && state != "down" {
		http.Error(w, "state must be `up` or `down`", 400)
		return
	}

	cmd := exec.Command("ip", "link", "set", "dev", iface, state)
	_, err := cmd.Output()

	if err != nil {
		log.Println("ip link failed", err)
		http.Error(w, "ip link failed", 400)
		return
	}

}

func getStatus(w http.ResponseWriter, r *http.Request) {
	reply := "Online"
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reply)
}

func getFeatures(w http.ResponseWriter, r *http.Request) {
	reply := []string{"dns"}
	//check which features are enabled
	virtual_spr := os.Getenv("VIRTUAL_SPR")
	if virtual_spr == "" || virtual_spr == "TEST" {
		reply = append(reply, "wifi")
	}

	if os.Getenv("PPPIF") != "" {
		reply = append(reply, "ppp")
	}

	if os.Getenv("WIREGUARD_PORT") != "" {
		reply = append(reply, "wireguard")
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reply)
}

// Helper function to make Docker API requests
func dockerRequest(method, path string, body io.Reader) ([]byte, error) {
	DockerSocketPath := "/var/run/docker.sock"

	c := http.Client{}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", DockerSocketPath)
		},
	}
	defer c.CloseIdleConnections()

	req, err := http.NewRequest(method, "http://localhost"+path, body)
	if err != nil {
		return nil, err
	}

	resp, err := c.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("docker API error %d: %s", resp.StatusCode, string(data))
	}

	return data, nil
}

// system info: uptime, docker ps etc.
func getInfo(w http.ResponseWriter, r *http.Request) {

	name := mux.Vars(r)["name"]

	if r.Method == http.MethodPut {
		if name == "hostname" {
			//rename the host
			newName := ""
			err := json.NewDecoder(r.Body).Decode(&newName)

			var validHostname = regexp.MustCompile(`^[a-zA-Z0-9-]+$`).MatchString
			if !validHostname(newName) {
				http.Error(w, "Unsupported hostname", 400)
				return
			}

			encoded := []byte(fmt.Sprintf("%q", newName))
			err = ioutil.WriteFile(HostnameConfigPath, encoded, 0600)
			if err != nil {
				http.Error(w, err.Error(), 400)
			}
			return

		}

		return
	}

	var data []byte
	var err error

	if name == "uptime" {
		cmd := exec.Command("uptime")
		output, err := cmd.Output()

		cmd = exec.Command("jc", "--uptime")
		stdin, err := cmd.StdinPipe()
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		go func() {
			defer stdin.Close()
			io.WriteString(stdin, strings.Replace(string(output), "0 user,", "0 users,", 1))
		}()

		data, err = cmd.Output()
	} else if name == "dockernetworks" {
		data, err = dockerRequest("GET", "/v1.41/networks", nil)
	} else if name == "docker" {
		data, err = dockerRequest("GET", "/v1.41/containers/json?all=1", nil)
	} else if name == "hostname" {
		data, err = ioutil.ReadFile(HostnameConfigPath)
		if err == nil && len(data) > 0 {
			//accept from hostname config path instead
			data = []byte(fmt.Sprintf("%q", data))
		} else {
			hostname, err2 := os.Hostname()
			if err2 != nil {
				http.Error(w, err.Error(), 400)
				return
			}

			data = []byte(fmt.Sprintf("%q", hostname))
			err = nil
		}
	} else if name == "ss" {
		data, err = exec.Command("jc", "-p", "ss", "-4", "-n").Output()
	} else {
		http.Error(w, "Invalid info", 400)
		return
	}

	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, string(data))
}

// get spr version
func getGitVersion(w http.ResponseWriter, r *http.Request) {
	plugin := r.URL.Query().Get("plugin")

	params := url.Values{}
	params.Set("plugin", plugin)

	req, err := http.NewRequest(http.MethodGet, "http://localhost/git_version?"+params.Encode(), nil)
	if err != nil {
		http.Error(w, fmt.Errorf("failed to make request for version "+plugin).Error(), 400)
		return
	}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		http.Error(w, fmt.Errorf("failed to request version from superd "+plugin).Error(), 400)
		return
	}

	defer resp.Body.Close()

	version := ""
	err = json.NewDecoder(resp.Body).Decode(&version)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Errorf("failed to get version %s", plugin+" "+fmt.Sprint(resp.StatusCode)).Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(version)
}

type ReleaseInfo struct {
	CustomChannel string
	CustomVersion string
	Current       string
}

func releaseInfo(w http.ResponseWriter, r *http.Request) {
	info := ReleaseInfo{}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	if r.Method == http.MethodGet {
		req, err := http.NewRequest(http.MethodGet, "http://localhost/release", nil)
		if err != nil {
			http.Error(w, fmt.Errorf("failed to make request for version from superd ").Error(), 400)
			return
		}

		resp, err := c.Do(req)
		if err != nil {
			http.Error(w, fmt.Errorf("failed to request version from superd ").Error(), 400)
			return
		}

		defer resp.Body.Close()

		err = json.NewDecoder(resp.Body).Decode(&info)
		if err != nil {
			http.Error(w, fmt.Errorf("failed to decode info").Error(), 400)
			return
		}

		if resp.StatusCode != http.StatusOK {
			http.Error(w, fmt.Errorf("failed to get info "+fmt.Sprint(resp.StatusCode)).Error(), 400)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(info)
		return
	}

	if r.Method == http.MethodDelete {
		req, err := http.NewRequest(http.MethodDelete, "http://localhost/release", nil)
		if err != nil {
			http.Error(w, fmt.Errorf("failed to make superd request").Error(), 400)
			return
		}

		resp, err := c.Do(req)
		if err != nil {
			http.Error(w, fmt.Errorf("failed to set superd release").Error(), 400)
			return
		}

		defer resp.Body.Close()
		_, err = ioutil.ReadAll(resp.Body)

		if resp.StatusCode != http.StatusOK {
			http.Error(w, fmt.Errorf("failed to set superd release "+fmt.Sprint(resp.StatusCode)).Error(), 400)
			return
		}

		// fall thru 200
		return
	}

	//put
	err := json.NewDecoder(r.Body).Decode(&info)
	if err != nil {
		http.Error(w, fmt.Errorf("failed to decode info").Error(), 400)
		return
	}

	jsonValue, _ := json.Marshal(info)

	req, err := http.NewRequest(http.MethodPut, "http://localhost/release", bytes.NewBuffer(jsonValue))
	if err != nil {
		return
	}

	resp, err := c.Do(req)
	if err != nil {
		http.Error(w, fmt.Errorf("failed to set superd release").Error(), 400)
		return
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Errorf("failed to set superd release "+fmt.Sprint(resp.StatusCode)).Error(), 400)
		return
	}
	//fall through success
}

func runAutoUpdates() {

	//once an hour, check if auto updates are enabled
	// if they are, then perform an update
	ticker := time.NewTicker(1 * time.Hour)
	for {
		select {
		case <-ticker.C:

			Configmtx.Lock()
			do_update := config.AutoUpdate
			do_report := config.ReportInstall && !config.ReportedInstall
			Configmtx.Unlock()

			if do_report {
				ReportInstall()
			}

			if do_update == true {
				//TBD 1) check a release has aged?
				//    2) check that a release is up to date

				//performUpdate()
			}
		}
	}
}

func saveMulticastJsonLocked(settings MulticastSettings) {
	file, _ := json.MarshalIndent(settings, "", " ")
	err := ioutil.WriteFile(MulticastConfigFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func loadMulticastJsonLocked() MulticastSettings {
	settings := MulticastSettings{}
	data, err := ioutil.ReadFile(MulticastConfigFile)
	if err != nil {
		return settings
	}
	_ = json.Unmarshal(data, &settings)
	return settings
}

func multicastSettings(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()
	settings := MulticastSettings{}

	if r.Method == http.MethodPut {
		err := json.NewDecoder(r.Body).Decode(&settings)
		if err != nil {
			http.Error(w, fmt.Errorf("failed to deserialize settings").Error(), 400)
			return
		}

		for _, entry := range settings.Addresses {
			saddr, err := net.ResolveUDPAddr("udp4", entry.Address)
			if !strings.Contains(entry.Address, ":") || err != nil {
				http.Error(w, fmt.Errorf("failed to parse udp address ").Error(), 400)
				return
			}

			_, multicastNet, _ := net.ParseCIDR("224.0.0.0/4")

			//double check multicast range
			if !multicastNet.Contains(saddr.IP) {
				http.Error(w, fmt.Errorf("Invalid multicast IP ").Error(), 400)
				return
			}
		}

		saveMulticastJsonLocked(settings)
		callSuperdRestart("", "multicast_udp_proxy")
	} else {
		settings = loadMulticastJsonLocked()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

func autoUpdate(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(config.AutoUpdate)
		return
	}

	if r.Method == http.MethodDelete {
		config.AutoUpdate = false
		saveConfigLocked()
		// fall thru 200
		return
	}

	config.AutoUpdate = true
	saveConfigLocked()
}

func checkUpdates(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(config.CheckUpdates)
		return
	}

	if r.Method == http.MethodDelete {
		config.CheckUpdates = false
		saveConfigLocked()
		// fall thru 200
		return
	}

	config.CheckUpdates = true
	saveConfigLocked()
}

func update(w http.ResponseWriter, r *http.Request) {
	errorStr := performUpdate()
	if errorStr != "" {
		http.Error(w, fmt.Errorf(errorStr).Error(), 400)
		return
	}
}

func performUpdate() string {

	//1) update /super git
	req, err := http.NewRequest(http.MethodPut, "http://localhost/update_git", bytes.NewBuffer([]byte("{}")))
	if err != nil {
		return "failed to make update request"
	}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		return "failed to call superd git pull "
	}

	//2) update each plugin
	for _, entry := range config.Plugins {
		if entry.ComposeFilePath != "" && entry.Enabled == true {
			if !updateExtension(entry.ComposeFilePath) {
				fmt.Println("[-] Failed to update extension " + entry.ComposeFilePath)
			}
		}
	}

	//3) superd update with service & compose_file
	req, err = http.NewRequest(http.MethodPut, "http://localhost/update", nil)
	if err != nil {
		return "failed to make update request"
	}

	c = getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err = c.Do(req)
	if err != nil {
		return "failed to call superd update "
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "failed to call superd update " + fmt.Sprint(resp.StatusCode)
	}

	//4) call start
	req, err = http.NewRequest(http.MethodPut, "http://localhost/start", nil)
	if err != nil {
		return "failed to make superd start request"
	}

	c = getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err = c.Do(req)
	if err != nil {
		return "failed to call superd start "
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return "failed to call superd start " + fmt.Sprint(resp.StatusCode)
	}

	return ""
}

func releasesAvailable(w http.ResponseWriter, r *http.Request) {
	container := r.URL.Query().Get("container")

	params := url.Values{}
	params.Set("container", container)

	appended := "?" + params.Encode()

	creds := GitOptions{PlusUser, config.PlusToken, true, false}
	jsonValue, _ := json.Marshal(creds)

	req, err := http.NewRequest(http.MethodPost, "http://localhost/remote_container_tags"+appended, bytes.NewBuffer(jsonValue))
	if err != nil {
		http.Error(w, fmt.Errorf("failed to make request for tags "+container).Error(), 400)
		return
	}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		http.Error(w, fmt.Errorf("failed to request tags from superd "+appended).Error(), 400)
		return
	}

	defer resp.Body.Close()

	var tagsResp struct {
		Tags []string `json:"tags"`
	}
	err = json.NewDecoder(resp.Body).Decode(&tagsResp)
	if err != nil {
		http.Error(w, fmt.Errorf("failed to get tags for %s", container).Error(), 400)
		return
	}

	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Errorf("failed to get tags %s", container+" "+fmt.Sprint(resp.StatusCode)).Error(), 400)
		return
	}

	// Filter build provenance tags starting with "sha256-"
	filteredTags := []string{}
	for _, tag := range tagsResp.Tags {
		if !strings.HasPrefix(tag, "sha256-") {
			filteredTags = append(filteredTags, tag)
		}
	}
	tagsResp.Tags = filteredTags

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tagsResp.Tags)
}

func releaseChannels(w http.ResponseWriter, r *http.Request) {
	reply := []string{"main", "-dev"}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reply)
}

// return "version" if <= 1 params else {"name": "version"}
func getContainerVersion(w http.ResponseWriter, r *http.Request) {
	var containers []string
	r.ParseForm()
	containers = r.Form["plugin"]
	if len(containers) == 0 {
		containers = append(containers, "superd")
	}

	containerVersions := make(map[string]string)
	for _, container := range containers {
		//TODO have superd support +1 params
		//container := r.URL.Query().Get("plugin")
		params := url.Values{}
		params.Set("container", container)

		data, statusCode, err := superdRequestMethod(http.MethodGet, "container_version", params, nil)
		if err != nil || statusCode != http.StatusOK {
			containerVersions[container] = ""
			continue
		}

		version := ""
		err = json.Unmarshal(data, &version)
		if err != nil {
			containerVersions[container] = ""
			continue
		}

		containerVersions[container] = version
	}

	if len(containerVersions) == 1 {
		for container, version := range containerVersions {
			if version == "" {
				http.Error(w, fmt.Errorf("failed to get version for %s", container).Error(), 400)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(version)

			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(containerVersions)
}

func doConfigsBackup(w http.ResponseWriter, r *http.Request) {
	//get version
	req, err := http.NewRequest(http.MethodGet, "http://localhost/git_version", nil)
	if err != nil {
		http.Error(w, fmt.Errorf("failed to make request for version ").Error(), 400)
		return
	}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		http.Error(w, fmt.Errorf("failed to request version from superd").Error(), 400)
		return
	}

	defer resp.Body.Close()

	version := ""
	err = json.NewDecoder(resp.Body).Decode(&version)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Errorf("failed to get version %s", fmt.Sprint(resp.StatusCode)).Error(), 400)
		return
	}

	filename := fmt.Sprintf("spr-configs-%s.tgz", strings.Trim(string(version), "\n"))
	validFilename := regexp.MustCompile(`^spr-configs-v[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+\.[0-9\-a-h]+)?.tgz$`).MatchString

	if !validFilename(filename) {
		http.Error(w, "Unexpected version found", 400)
		return
	}

	backupFilePath := ConfigBackupDirectory + "/" + filename

	err = exec.Command("tar", "czf", backupFilePath, TEST_PREFIX+"/configs").Run()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(filename)
}

func getConfigsBackup(w http.ResponseWriter, r *http.Request) {
	// regex match git version tag
	// tagFmt="^v?[0-9]+\.[0-9]+\.[0-9]+$"
	// preTagFmt="^v?[0-9]+\.[0-9]+\.[0-9]+(-$suffix\.[0-9]+)$"
	// example: v0.1.1-beta.5-1-g79a97ae
	validFilename := regexp.MustCompile(`^spr-configs-v[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+\.[0-9\-a-h]+)?.tgz$`).MatchString

	filename := mux.Vars(r)["name"]

	// list files if empty
	if filename == "" {
		backups, err := filepath.Glob(ConfigBackupDirectory + "/spr-configs-*.tgz")

		if err != nil {
			http.Error(w, "Invalid config name", 400)
			return
		}

		type BackupFileEntry struct {
			Name      string
			Timestamp time.Time
		}

		result := []BackupFileEntry{}
		for _, entry := range backups {
			file, err := os.Stat(entry)
			if err != nil {
				continue
			}

			result = append(result, BackupFileEntry{
				Name:      filepath.Base(entry),
				Timestamp: file.ModTime(),
			})
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)

		return
	}

	if !validFilename(filename) {
		http.Error(w, "Invalid config name", 400)
		return
	}

	backupFilePath := ConfigBackupDirectory + "/" + filename

	// verify
	absPath := filepath.Dir(filepath.Clean(backupFilePath))
	_, err := os.Stat(backupFilePath)
	if absPath != ConfigBackupDirectory || err != nil {
		http.Error(w, "Invalid config name", 400)
		return
	}

	if r.Method == http.MethodDelete {
		os.Remove(backupFilePath)

		return
	}

	http.ServeFile(w, r, backupFilePath)
}

func enableTLS(w http.ResponseWriter, r *http.Request) {
	//NOTE crt and key both need to exist to set API_SSL_PORT == enable tls
	_, err := os.Stat(ApiTlsCert)
	haveTLSCert := err == nil || !os.IsNotExist(err)

	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(haveTLSCert)
		return
	}

	if r.Method == http.MethodDelete {
		if !haveTLSCert {
			http.Error(w, "Not configured", 400)
			return
		}

		os.Remove(ApiTlsCert)
	} else {
		//for now, do not support regenerating if already exists
		if haveTLSCert {
			http.Error(w, "Already configured", 400)
			return
		}

		err = exec.Command("/scripts/generate-certificate.sh").Run()
		if err != nil {
			http.Error(w, "Failed to generate TLS certificate", 400)
			return
		}
	}

	go func() {
		time.Sleep(1 * time.Second)
		callSuperdRestart("", "api")
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode("Done")
}

func restart(w http.ResponseWriter, r *http.Request) {
	//restart all containers
	go callSuperdRestart("", "")
}

var Devicesmtx sync.Mutex

func scrubDevice(entry DeviceEntry) DeviceEntry {
	new_entry := entry
	if new_entry.PSKEntry.Psk != "" {
		new_entry.PSKEntry.Psk = "**"
	}
	return new_entry
}

func convertDevicesPublic(devices map[string]DeviceEntry) map[string]DeviceEntry {
	// do not pass PSK key material
	scrubbed_devices := make(map[string]DeviceEntry)
	for i, entry := range devices {
		scrubbed_devices[i] = scrubDevice(entry)
	}
	return scrubbed_devices
}

func savePublicDevicesJson(scrubbed_devices map[string]DeviceEntry) {
	file, _ := json.MarshalIndent(scrubbed_devices, "", " ")
	err := ioutil.WriteFile(DevicesPublicConfigFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func saveDevicesJson(devices map[string]DeviceEntry) {
	file, _ := json.MarshalIndent(devices, "", " ")
	err := ioutil.WriteFile(DevicesConfigFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}

	scrubbed_devices := convertDevicesPublic(devices)
	savePublicDevicesJson(scrubbed_devices)

	SprbusPublish("devices:save", scrubbed_devices)
}

func getDevicesJson() map[string]DeviceEntry {
	devices := map[string]DeviceEntry{}
	data, err := ioutil.ReadFile(DevicesConfigFile)
	if err != nil {
		return nil
	}
	err = json.Unmarshal(data, &devices)
	if err != nil {
		log.Fatal(err)
	}

	scrubbed_devices := convertDevicesPublic(devices)

	// load the public file. if it does not match, remake it.
	data, err = ioutil.ReadFile(DevicesPublicConfigFile)
	if err != nil {
		// file was not made yet
		savePublicDevicesJson(scrubbed_devices)
	} else {
		public_devices := map[string]DeviceEntry{}
		err = json.Unmarshal(data, &public_devices)
		if err != nil {
			//data was invalid
			savePublicDevicesJson(scrubbed_devices)
		} else if !reflect.DeepEqual(public_devices, scrubbed_devices) {
			//an update was since made
			savePublicDevicesJson(scrubbed_devices)
		}
	}

	return devices
}

func getDevices(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	devices := getDevicesJson()

	//mask PSKs
	for i, entry := range devices {
		if entry.PSKEntry.Psk != "" {
			entry.PSKEntry.Psk = "**"
			devices[i] = entry
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(devices)
}

func getDevice(w http.ResponseWriter, r *http.Request) {
	identity := r.URL.Query().Get("identity")
	if strings.Contains(identity, ":") {
		identity = trimLower(identity)
	}

	//nomask := r.URL.Query().Get("nomask")
	//if nomask != "" {}

	if identity == "" {
		http.Error(w, "Invalid device identity", 400)
		return
	}

	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	devices := getDevicesJson()

	dev, exists := devices[identity]
	if !exists {
		http.Error(w, "Invalid device identity", 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dev)
}

func handleUpdateDevice(w http.ResponseWriter, r *http.Request) {
	identity := r.URL.Query().Get("identity")

	if strings.Contains(identity, ":") {
		//normalize MAC addresses
		identity = trimLower(identity)
	}

	if identity == "" {
		http.Error(w, "Invalid device identity", 400)
		return
	}

	dev := DeviceEntry{}
	err := json.NewDecoder(r.Body).Decode(&dev)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	errorMsg, code := updateDevice(w, r, dev, identity)

	if code != 200 {
		http.Error(w, errorMsg, code)
		return
	}

}

func handleExpirations(val *DeviceEntry, req *DeviceEntry) {
	if req.DeviceExpiration == -1 {
		val.DeviceExpiration = 0
	} else if req.DeviceExpiration > 0 {
		val.DeviceExpiration = time.Now().Unix() + req.DeviceExpiration
	}
	val.DeleteExpiration = req.DeleteExpiration
	val.DeviceDisabled = req.DeviceDisabled

	if val.DeviceDisabled && !slices.Contains(val.Policies, "disabled") {
		val.Policies = append(val.Policies, "disabled")
	} else if !val.DeviceDisabled && slices.Contains(val.Policies, "disabled") {
		//remove disabled
		policies := []string{}
		for _, entry := range val.Policies {
			if entry != "disabled" {
				policies = append(policies, entry)
			}
		}
		val.Policies = policies
	}

}

func checkDeviceExpiries(devices map[string]DeviceEntry, groups []GroupEntry) {
	curtime := time.Now().Unix()
	todelete := []string{}
	updates := make(map[string]DeviceEntry)

	doUpdate := false
	for k, entry := range devices {
		updated := false

		if entry.DeviceDisabled == false && entry.DeviceExpiration != 0 {
			if entry.DeviceExpiration < curtime {
				doUpdate = true
				updated = true
				//expire the device
				entry.DeviceDisabled = true
				if entry.DeleteExpiration {
					todelete = append(todelete, k)
				} else {
					//not deleting, make sure it gets the Disabled policy.
					if !slices.Contains(entry.Policies, "disabled") {
						entry.Policies = append(entry.Policies, "disabled")
					}
				}
				if entry.MAC != "" {
					//deauth the station
					deauthConnectedStation(entry.MAC)
				}
			}
		}

		if entry.DeviceDisabled == false && slices.Contains(entry.DeviceTags, "guest") {
			//if a device has the guest tag, check if RecentDHCP > 30 days, if so, then delete it.
			lastTime, err := time.Parse("2006-01-02 15:04:05.999999999 -0700 MST", entry.DHCPLastTime)
			if err != nil {
				// Handle error
				return
			}

			if time.Since(lastTime) > 30*24*time.Hour {
				entry.DeviceDisabled = true
				doUpdate = true
				updated = true
			}
		}

		if updated {
			updates[k] = entry
		}
	}

	for k, v := range updates {
		devices[k] = v
	}

	for _, k := range todelete {
		deleteDeviceLocked(devices, groups, k)
	}

	//did not delete anything but a disable happened, save.
	if doUpdate && len(todelete) == 0 {
		doReloadPSKFiles()
		saveDevicesJson(devices)
	}

}

var (
	isProcessingSync  bool
	processingSyncMtx sync.Mutex
)

func syncDevices(w http.ResponseWriter, r *http.Request) {
	processingSyncMtx.Lock()
	if isProcessingSync {
		processingSyncMtx.Unlock()
		http.Error(w, "A sync request is already in progress", http.StatusServiceUnavailable)
		return
	}
	isProcessingSync = true
	processingSyncMtx.Unlock()

	devices := map[string]DeviceEntry{}
	err := json.NewDecoder(r.Body).Decode(&devices)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte("Sync requested successfully"))

	go func() {
		defer func() {
			processingSyncMtx.Lock()
			isProcessingSync = false
			processingSyncMtx.Unlock()
		}()

		Groupsmtx.Lock()
		defer Groupsmtx.Lock()
		Devicesmtx.Lock()
		defer Devicesmtx.Unlock()

		saveDevicesJson(devices)
		groups := getGroupsJson()

		for _, val := range devices {
			refreshDeviceGroupsAndPolicy(devices, groups, val)
			refreshDeviceTags(val)
		}
		doReloadPSKFiles()
	}()
}

func addGroupsIfMissing(groups []GroupEntry, newGroups []string) {
	saveGroups := false

	for _, entry := range newGroups {
		foundGroup := false
		for _, group := range groups {
			if group.Name == entry {
				foundGroup = true
				break
			}
		}

		if !foundGroup {
			saveGroups = true
			newGroup := GroupEntry{}
			newGroup.Name = entry
			newGroup.GroupTags = []string{}
			groups = append(groups, newGroup)
		}
	}

	if saveGroups {
		saveGroupsJson(groups)
	}
}
func deleteDeviceLocked(devices map[string]DeviceEntry, groups []GroupEntry, identity string) {
	val := devices[identity]
	delete(devices, identity)
	saveDevicesJson(devices)
	refreshDeviceGroupsAndPolicy(devices, groups, val)
	doReloadPSKFiles()

	//if the device had a VLAN Tag, also refresh vlans
	// upon deletion
	if val.VLANTag != "" {
		Groupsmtx.Unlock()
		Devicesmtx.Unlock()
		refreshVLANTrunks()
		Groupsmtx.Lock()
		Devicesmtx.Lock()
	}

	//notify the bus
	SprbusPublish("device:delete", scrubDevice(val))

}

func updateDevice(w http.ResponseWriter, r *http.Request, dev DeviceEntry, identity string) (string, int) {

	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	devices := getDevicesJson()
	groups := getGroupsJson()

	// copy another device
	sourceDeviceMAC := r.URL.Query().Get("copy")
	if sourceDeviceMAC != "" {
		sourceDevice, exists := devices[sourceDeviceMAC]

		if !exists {
			return "invalid source device", 400
		}

		dev.PSKEntry.Type = sourceDevice.PSKEntry.Type
		dev.PSKEntry.Psk = sourceDevice.PSKEntry.Psk
		dev.Groups = sourceDevice.Groups
		dev.Policies = sourceDevice.Policies
		dev.DeviceTags = sourceDevice.DeviceTags
	}

	if dev.PSKEntry.Type != "" {
		if dev.PSKEntry.Type != "sae" && dev.PSKEntry.Type != "wpa2" {
			return "invalid PSK Type", 400
		}
	}

	if len(dev.PSKEntry.Psk) > 0 && len(dev.PSKEntry.Psk) < 8 {
		return "psk too short", 400
	}

	validIconOrColor := regexp.MustCompile(`^[a-zA-z]+$`).MatchString
	if dev.Style.Icon != "" && !validIconOrColor(dev.Style.Icon) {
		return "invalid icon", 400
	}

	if dev.Style.Color != "" && !validIconOrColor(dev.Style.Color) {
		return "invalid color", 400
	}

	//normalize groups, policies, and tags
	dev.Policies = normalizeStringSlice(dev.Policies)

	//validate policies now
	for _, policy := range dev.Policies {
		if !slices.Contains(ValidPolicyStrings, policy) {
			return "Invalid policy name provided", 400
		}
	}

	dev.Groups = normalizeStringSlice(dev.Groups)
	dev.DeviceTags = normalizeStringSlice(dev.DeviceTags)

	//dont allow groups or tags to collide with policy
	for _, group := range dev.Groups {
		if slices.Contains(ValidPolicyStrings, group) {
			return "Invalid group name provided collides with policy name", 400
		}
	}

	for _, tag := range dev.DeviceTags {
		if slices.Contains(ValidPolicyStrings, tag) {
			return "Invalid tag name provided collides with policy name", 400
		}
	}

	dev.MAC = trimLower(dev.MAC)

	val, exists := devices[identity]

	if r.Method == http.MethodDelete {
		//delete a device
		if exists {
			deleteDeviceLocked(devices, groups, identity)
			return "", 200
		}

		return "Not found", 404
	}

	//always overwrite pending
	if identity == "pending" {
		val = DeviceEntry{}
		exists = false
	}

	pskGenerated := false
	pskModified := false
	refreshGroups := false
	refreshPolicies := false
	refreshTags := false
	refreshVlanTrunks := false

	//validations
	if dev.VLANTag != "" {
		n, err := strconv.Atoi(dev.VLANTag)
		if err != nil || n < 0 {
			return "VLANTag field must contain a value > 0", 400
		}
		refreshVlanTrunks = true
	}

	if exists {
		//updating an existing entry. Check what was requested

		if dev.Name != "" {
			val.Name = dev.Name
		}

		if dev.WGPubKey != "" {
			val.WGPubKey = dev.WGPubKey
		}

		if dev.VLANTag != "" {
			//reset to empty
			if dev.VLANTag == "0" {
				val.VLANTag = ""
			} else {
				val.VLANTag = dev.VLANTag
			}
		}

		refreshIP := false

		if dev.RecentIP != "" {
			new_ip := net.ParseIP(dev.RecentIP)
			if new_ip != nil && isTinyNetDeviceIP(new_ip.String()) {
				if val.RecentIP != new_ip.String() {
					val.RecentIP = new_ip.String()
					refreshIP = true
				}
			} else {
				if new_ip == nil {
					return "Invalid IP assignment", 400
				} else {
					return "IP assignment not in configured IP ranges", 400
				}
			}
		}

		if dev.DNSCustom != "" {
			if dev.DNSCustom == "0" {
				//cleared the DNS value
				delCustomDNSElement(val.RecentIP, val.DNSCustom)
				dev.DNSCustom = ""
			} else {
				dns_ip := net.ParseIP(dev.DNSCustom)
				if dns_ip == nil {
					return "Invalid Custom DNS", 400
				}
			}
			val.DNSCustom = dev.DNSCustom
		}

		if dev.PSKEntry.Psk != "" {
			//assign a new PSK
			pskModified = true
			val.PSKEntry.Psk = dev.PSKEntry.Psk
		}

		if dev.PSKEntry.Type != "" {
			pskModified = true
			val.PSKEntry.Type = dev.PSKEntry.Type

			//when setting PSK type, but the device
			// did not previously have a PSK set,
			// generate a secure PSK

			if val.PSKEntry.Psk == "" {
				psk, err := genSecurePassword()
				if err != nil {
					log.Error("Failed to generate password")
					return "Failed to generate password", 400
				}

				val.PSKEntry.Psk = psk
				pskGenerated = true
			}
		}

		if dev.DeviceTags != nil && !equalStringSlice(val.DeviceTags, dev.DeviceTags) {
			val.DeviceTags = dev.DeviceTags
			refreshTags = true
		}

		if dev.Groups != nil && !equalStringSlice(val.Groups, dev.Groups) {
			val.Groups = dev.Groups
			addGroupsIfMissing(groups, dev.Groups)
			refreshGroups = true
		}

		if dev.Policies != nil && !equalStringSlice(val.Policies, dev.Policies) {
			val.Policies = dev.Policies
			refreshPolicies = true
		}

		if dev.Style.Icon != "" {
			val.Style.Icon = dev.Style.Icon
		}

		if dev.Style.Color != "" {
			val.Style.Color = dev.Style.Color
		}

		handleExpirations(&val, &dev)

		devices[identity] = val
		saveDevicesJson(devices)

		if pskModified {
			//psks updated -- update hostapd
			doReloadPSKFiles()
		}

		if refreshPolicies || refreshGroups {
			refreshDeviceGroupsAndPolicy(devices, groups, val)
			SprbusPublish("device:groups:update", scrubDevice(dev))
		}

		if refreshTags {
			refreshDeviceTags(val)
			SprbusPublish("device:tags:update", scrubDevice(dev))
		}

		if refreshIP {
			if val.MAC != "" {
				iface := getRouteInterface(val.RecentIP)
				if iface != "" {
					//if the device is currently routed, then update it
					handleDHCPResult(val.MAC, val.RecentIP, "", val.Name, iface)
				}
			}

		}

		//locks no longer needed

		if refreshVlanTrunks {
			Groupsmtx.Unlock()
			Devicesmtx.Unlock()
			refreshVLANTrunks()
			Groupsmtx.Lock()
			Devicesmtx.Lock()
		}

		//mask the PSK if set and not generated
		if val.PSKEntry.Psk != "" && pskGenerated == false {
			val.PSKEntry.Psk = "**"
		}

		SprbusPublish("device:update", scrubDevice(val))

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(val)
		return "", 200
	}

	//creating a new device entry

	if strings.Contains(identity, ":") {
		//looking at a MAC, set it if not set
		if dev.MAC == "" {
			dev.MAC = identity
		}
	}

	//generate secure PSK if needed
	if dev.PSKEntry.Type != "" {
		pskModified = true
		if dev.PSKEntry.Psk == "" {
			psk, err := genSecurePassword()
			if err != nil {
				log.Error("Failed to generate password")
				return "Failed to generate password", 400
			}

			dev.PSKEntry.Psk = psk

			pskGenerated = true
		}
	}

	if dev.DeviceTags == nil {
		dev.DeviceTags = []string{}
	}

	if dev.Groups == nil {
		dev.Groups = []string{}
	}

	if dev.Policies == nil {
		dev.Policies = []string{}
	}

	if len(dev.Groups) != 0 {
		//update verdict maps for the device
		refreshGroups = true
	}

	if len(dev.Policies) != 0 {
		refreshPolicies = true
	}

	handleExpirations(&dev, &dev)

	devices[identity] = dev
	saveDevicesJson(devices)

	SprbusPublish("device:save", scrubDevice(dev))

	if pskModified {
		//psks updated -- update hostapd
		doReloadPSKFiles()
	}

	if refreshGroups || refreshPolicies {
		refreshDeviceGroupsAndPolicy(devices, groups, val)
	}

	if pskGenerated == false {
		dev.PSKEntry.Psk = "**"
	}

	// create vlans
	if refreshVlanTrunks {
		Groupsmtx.Unlock()
		Devicesmtx.Unlock()
		refreshVLANTrunks()
		Groupsmtx.Lock()
		Devicesmtx.Lock()
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dev)

	return "", 200
}

func pendingPSK(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	devices := getDevicesJson()
	_, exists := devices["pending"]

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(exists)
}

func saveGroupsJson(groups []GroupEntry) {
	file, _ := json.MarshalIndent(groups, "", " ")
	err := ioutil.WriteFile(GroupsConfigFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func getGroupsJson() []GroupEntry {
	groups := []GroupEntry{}
	data, err := ioutil.ReadFile(GroupsConfigFile)
	if err != nil {
		return nil
	}
	err = json.Unmarshal(data, &groups)
	if err != nil {
		log.Fatal(err)
	}
	return groups
}

var Groupsmtx sync.Mutex

func getGroups(w http.ResponseWriter, r *http.Request) {
	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()
	groups := getGroupsJson()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(groups)
}

func updateGroups(w http.ResponseWriter, r *http.Request) {
	group := GroupEntry{}
	err := json.NewDecoder(r.Body).Decode(&group)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	group.Name = trimLower(group.Name)
	if group.Name == "" {
		http.Error(w, "Invalid group name", 400)
		return
	}

	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()
	groups := getGroupsJson()

	if r.Method == http.MethodDelete {
		//[]GroupEntry
		for idx, entry := range groups {
			if entry.Name == group.Name {
				groups := append(groups[:idx], groups[idx+1:]...)
				saveGroupsJson(groups)
				return
			}
		}

		http.Error(w, "Not found", 404)
		return
	}

	//find the zone or update it
	for idx, entry := range groups {
		if entry.Name == group.Name {
			entry.Disabled = group.Disabled
			entry.GroupTags = group.GroupTags
			groups[idx] = entry
			saveGroupsJson(groups)
			return
		}
	}

	if group.GroupTags == nil {
		group.GroupTags = []string{}
	}

	//make a new group
	groups = append(groups, group)
	saveGroupsJson(groups)
}

func trimLower(a string) string {
	return strings.TrimSpace(strings.ToLower(a))
}

func equalMAC(a string, b string) bool {
	return trimLower(a) == trimLower(b)
}

func normalizeStringSlice(a []string) []string {
	if len(a) == 0 {
		return a
	}
	ret := []string{}
	for _, entry := range a {
		next := trimLower(entry)
		if next == "" {
			continue
		}
		ret = append(ret, next)
	}
	return ret
}

func equalStringSlice(a []string, b []string) bool {
	if len(a) != len(b) {
		return false
	}

	for i := 0; i < len(a); i++ {
		if a[i] != b[i] {
			return false
		}
	}

	return true
}

var (
	builtin_maps = []string{"internet_access", "dns_access", "lan_access", "ethernet_filter"}

	ignore_groups = []string{"isolated", "lan", "wan", "dns", "api"}
)

func getGroupVerdictMapNames() []string {
	custom_maps := []string{}
	zones := getGroupsJson()
	for _, z := range zones {
		skip := false
		//ignore deprecated groups, these are now policies.
		for _, y := range ignore_groups {
			if y == z.Name {
				skip = true
				break
			}
		}
		if skip == false {
			custom_maps = append(custom_maps, z.Name+"_src_access")
			custom_maps = append(custom_maps, z.Name+"_dst_access")
		}
	}
	return custom_maps
}

func getVerdictMapNames() []string {
	custom_maps := getGroupVerdictMapNames()
	return append(builtin_maps, custom_maps...)
}

type verdictEntry struct {
	ipv4   string
	ifname string
	mac    string
}

func getNFTVerdictMap(map_name string) []verdictEntry {
	//google/nftables is incomplete and does not support custom set key types

	existing := []verdictEntry{}

	//nft -j list map inet filter name
	stdout, err := ListMapJSON("inet", "filter", map_name)
	if err != nil {
		return existing
	}

	//jq .nftables[1].map.elem[][0].concat
	var data map[string]interface{}
	err = json.Unmarshal(stdout, &data)
	data2, ok := data["nftables"].([]interface{})
	if !ok {
		log.Printf("getNFTVerdictMap: invalid json structure - missing nftables")
		return existing
	}

	// The new ListMapJSON implementation only returns the map data without metadata
	// So we need to check for either format (old nft -j had metadata at index 0)
	var mapIndex int
	if len(data2) == 0 {
		log.Printf("getNFTVerdictMap: empty nftables array")
		return existing
	} else if len(data2) == 1 {
		// New format: only map data
		mapIndex = 0
	} else {
		// Old format: metadata at 0, map at 1
		mapIndex = 1
	}

	data3, ok := data2[mapIndex].(map[string]interface{})
	if !ok {
		log.Printf("getNFTVerdictMap: invalid structure at nftables[%d]", mapIndex)
		return existing
	}

	data4, ok := data3["map"].(map[string]interface{})
	if !ok {
		log.Printf("getNFTVerdictMap: missing map in nftables[%d]", mapIndex)
		return existing
	}

	data5, ok := data4["elem"].([]interface{})
	if !ok {
		// Map might be empty, which is fine
		return existing
	}

	for _, d := range data5 {
		// Handle both array format and direct map format
		var f map[string]interface{}

		// Try direct map format first (newer format)
		if direct_map, ok := d.(map[string]interface{}); ok {
			f = direct_map
		} else {
			// Try array format (older format)
			e, ok := d.([]interface{})
			if !ok || len(e) == 0 {
				continue
			}

			f_temp, ok := e[0].(map[string]interface{})
			if !ok {
				continue
			}
			f = f_temp
		}

		// Check if we have the expected "concat" format
		g, concat_ok := f["concat"].([]interface{})
		if concat_ok && len(g) > 0 {
			// Original format with concat array
			// Get first element
			first, _ := g[0].(string)

			// Check for second element
			if len(g) > 1 {
				second, second_ok := g[1].(string)
				if len(g) > 2 {
					third, third_ok := g[2].(string)
					if third_ok && second_ok {
						existing = append(existing, verdictEntry{first, second, third})
					}
				} else {
					if second_ok {
						if map_name == "dhcp_access" {
							// type ifname . ether_addr : verdict (no IP)
							entry := verdictEntry{"", first, second}
							existing = append(existing, entry)
						} else {
							// for _dst_access
							// type ipv4_addr . ifname : verdict (no MAC)
							existing = append(existing, verdictEntry{first, second, ""})
						}
					}
				}
			}
		} else {
			// New format where the key is a single concatenated string
			// The key is the first key in the map
			for key, _ := range f {
				if map_name == "dhcp_access" && len(key) >= 22 {
					// dhcp_access: ifname (16 bytes) . ether_addr (8 bytes)
					// Extract interface name (first 16 bytes, null-terminated)
					ifname_bytes := []byte(key[:16])
					var ifname string
					null_idx := -1
					for i, b := range ifname_bytes {
						if b == 0 {
							null_idx = i
							break
						}
					}
					if null_idx >= 0 {
						ifname = string(ifname_bytes[:null_idx])
					} else {
						ifname = string(ifname_bytes)
					}

					// Extract MAC address (next 6 bytes)
					if len(key) >= 22 {
						mac_bytes := []byte(key[16:22])
						mac := fmt.Sprintf("%02x:%02x:%02x:%02x:%02x:%02x",
							mac_bytes[0], mac_bytes[1], mac_bytes[2],
							mac_bytes[3], mac_bytes[4], mac_bytes[5])

						entry := verdictEntry{"", ifname, mac}
						existing = append(existing, entry)
					}
				}
				break // Only process the first key
			}
		}
	}
	return existing
}

type dnsVerdictEntry struct {
	srcip string
	dstip string
}

func getCustomDNSVerdictMap() []dnsVerdictEntry {
	existing := []dnsVerdictEntry{}

	stdout, err := ListMapJSON("inet", "nat", "custom_dns_devices")
	if err != nil {
		return existing
	}

	var data map[string]interface{}
	err = json.Unmarshal(stdout, &data)
	if err != nil {
		return existing
	}

	data2, ok := data["nftables"].([]interface{})
	if !ok {
		log.Println("invalid json: nftables field")
		return existing
	}

	if len(data2) < 2 {
		return existing
	}

	data3, ok := data2[1].(map[string]interface{})
	if !ok {
		log.Println("invalid json: nftables[1] field")
		return existing
	}

	data4, ok := data3["map"].(map[string]interface{})
	if !ok {
		log.Println("invalid json: map field")
		return existing
	}

	data5, ok := data4["elem"].([]interface{})
	if !ok {
		//no elements. return
		return existing
	}

	for _, d := range data5 {
		e, ok := d.([]interface{})
		if !ok {
			continue
		}

		if len(e) >= 2 {
			srcIP, srcOk := e[0].(string)
			dstIP, dstOk := e[1].(string)

			if srcOk && dstOk {
				existing = append(existing, dnsVerdictEntry{
					srcip: srcIP,
					dstip: dstIP,
				})
			}
		}
	}

	return existing
}

func getMapVerdict(name string) string {
	//custom map filtering for destinations is split between two tables.
	// the src_access table is the second half, and _dst_access is the first half
	// The first half uses a continue verdict to transfer into the second verdict map
	if strings.Contains(name, "_dst_access") {
		return "continue"
	}
	return "accept"
}

func searchVmapsByMac(MAC string, VMaps []string) (error, string, string) {
	//Search verdict maps and return the ipv4 and interface name
	for _, name := range VMaps {
		entries := getNFTVerdictMap(name)
		for _, entry := range entries {
			if equalMAC(entry.mac, MAC) {
				if entry.ifname != "" && entry.ipv4 != "" {
					return nil, entry.ipv4, entry.ifname
				}
			}
		}
	}
	return errors.New("Mac not found"), "", ""
}

func updateArp(Ifname string, IP string, MAC string) {
	err := exec.Command("arp", "-i", Ifname, "-s", IP, MAC).Run()
	if err != nil {
		log.Println("arp -i", Ifname, IP, MAC, "failed", err)
		return
	}
}

var LocalMappingsmtx sync.Mutex

func updateLocalMappings(IP string, Name string) {

	LocalMappingsmtx.Lock()
	defer LocalMappingsmtx.Unlock()

	var localMappingsPath = TEST_PREFIX + "/state/dns/local_mappings"
	data, err := ioutil.ReadFile(localMappingsPath)
	if err != nil {
		return
	}
	entryName := Name + ".lan"
	new_data := ""
	for _, line := range strings.Split(string(data), "\n") {
		pieces := strings.Split(line, " ")
		if len(pieces) < 2 {
			continue
		}
		ip := pieces[0]
		hostname := pieces[1]
		if entryName == hostname {
			continue
		}
		new_data += ip + " " + hostname + "\n"
	}
	new_data += IP + " " + entryName + "\n"
	ioutil.WriteFile(localMappingsPath, []byte(new_data), 0600)
}

func refreshWireguardDevice(MAC string, IP string, PublicKey string, Iface string, Name string, Create bool) {
	if Create {
		if Name != "" {
			updateLocalMappings(IP, Name)
		}
	}
}

func lookupWGDevice(devices *map[string]DeviceEntry, WGPubKey string, IP string) (DeviceEntry, bool) {
	//match first WGPubKey, then first RecentIP
	for _, device := range *devices {
		if WGPubKey != "" && device.WGPubKey == WGPubKey {
			return device, true
		}

		if IP != "" && device.RecentIP == IP {
			return device, true
		}
	}
	return DeviceEntry{}, false
}

// from https://github.com/ItsJimi/go-arp/blob/master/arp.go
// Entry define the list available in /proc/net/arp
type ArpEntry struct {
	IP     string
	HWType string
	Flags  string
	MAC    string
	Mask   string
	Device string
}

func removeWhiteSpace(tab []string) []string {
	var newTab []string
	for _, element := range tab {
		if element == "" {
			continue
		}
		newTab = append(newTab, element)
	}

	return newTab
}

// GetArpEntries lists ARP entries in /proc/net/arp
func GetArpEntries() ([]ArpEntry, error) {
	fileDatas, err := ioutil.ReadFile("/proc/net/arp")
	if err != nil {
		return nil, err
	}

	entries := []ArpEntry{}
	datas := strings.Split(string(fileDatas), "\n")
	for i, data := range datas {
		if i == 0 || data == "" {
			continue
		}
		parsedData := removeWhiteSpace(strings.Split(data, " "))
		entries = append(entries, ArpEntry{
			IP:     parsedData[0],
			HWType: parsedData[1],
			Flags:  parsedData[2],
			MAC:    parsedData[3],
			Mask:   parsedData[4],
			Device: parsedData[5],
		})
	}

	return entries, nil
}

// GetEntryFromMAC get an entry by searching with MAC address
func GetArpEntryFromMAC(mac string) (ArpEntry, error) {
	entries, err := GetArpEntries()
	if err != nil {
		return ArpEntry{}, err
	}

	for _, entry := range entries {
		if entry.MAC == mac {
			return entry, nil
		}
	}

	return ArpEntry{}, errors.New("MAC address not found")
}

func showARP(w http.ResponseWriter, r *http.Request) {
	entries, err := GetArpEntries()
	if err != nil {
		log.Println(err)
		http.Error(w, "Failed to get entries", 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entries)
}

type PSKAuthFailure struct {
	Type   string
	MAC    string
	Reason string
	Status string
}

type PSKAuthSuccess struct {
	Iface  string
	Event  string
	MAC    string
	Status string
	Router string
}

type StationDisconnect struct {
	Iface  string
	Event  string
	MAC    string
	Status string
	Router string
}

func reportPSKAuthFailure(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	pskf := PSKAuthFailure{}
	err := json.NewDecoder(r.Body).Decode(&pskf)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	SprbusPublish("wifi:auth:fail", pskf)

	if pskf.MAC == "" || (pskf.Type != "sae" && pskf.Type != "wpa") || (pskf.Reason != "noentry" && pskf.Reason != "mismatch") {
		http.Error(w, "malformed data", 400)
		return
	}

	updateMeshPluginConnectFailure(pskf)

	//no longer assign MAC on Auth Failure due to noentry
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pskf)
}

func reportPSKAuthSuccess(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	pska := PSKAuthSuccess{}
	err := json.NewDecoder(r.Body).Decode(&pska)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	SprbusPublish("wifi:auth:success", pska)

	if pska.Iface == "" || pska.Event != "AP-STA-CONNECTED" || pska.MAC == "" {
		http.Error(w, "malformed data", 400)
		return
	}

	pska.Status = "Okay"

	if isSetupMode() && pska.Iface == SetupAP {
		//abort early on setup mode
		pska.Status = "Okay-setup"
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(pska)
		return
	}

	//check if there is a pending psk to assign. if the mac is not known, then it was the pending psk

	devices := getDevicesJson()
	pendingPsk, exists := devices["pending"]

	guest_wifi := strings.Contains(pska.Iface, ExtraBSSPrefix)

	if exists && !guest_wifi {
		var foundPSK = false
		for _, device := range devices {
			if device.MAC == pska.MAC {
				if device.PSKEntry.Psk != "" {
					foundPSK = true
					break
				} else {
					// psk was empty, we re-claim this mac entry
					// and assign pending to it
				}
			}
		}

		//psk not in known devices. Assign it and delete pending
		if !foundPSK {
			//assign MAC to pendingPSK
			pendingPsk.MAC = pska.MAC
			devices[pska.MAC] = pendingPsk
			pska.Status = "Installed Pending PSK"
			delete(devices, "pending")
			saveDevicesJson(devices)
			doReloadPSKFiles()
		} else if devices[pska.MAC].PSKEntry.Type == "" {
			//we do have the device. but does it have a wifi password assigned yet?
			// if it does not, we assign the pending PSK password to it
			//this can happen during setup.
			device := devices[pska.MAC]
			device.PSKEntry = pendingPsk.PSKEntry
			devices[pska.MAC] = device
			delete(devices, "pending")
			saveDevicesJson(devices)
			doReloadPSKFiles()
		}
	}

	updateMeshPluginConnect(pska)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pska)
}

func reportDisconnect(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	event := StationDisconnect{}
	err := json.NewDecoder(r.Body).Decode(&event)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	SprbusPublish("wifi:station:disconnect", event)

	if event.Iface == "" || event.Event != "AP-STA-DISCONNECTED" || event.MAC == "" {
		http.Error(w, "malformed data", 400)
		return
	}

	deleteLanInterface(event.Iface)

	event.Status = "Okay"

	updateMeshPluginDisconnect(event)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(event)
}

func genSecurePassword() (string, error) {
	const pwUpperCharsHuman string = "ABCDEFGHJKMNPQRSTUVWXYZ"
	const pwLowerCharsHuman string = "abcdefghjkmnpqrstuvwxyz"
	const pwNumbersHuman string = "23456789"
	const pwSpecialCharsHuman string = "=#%+-*" //"\"/\\_|~"
	const cr string = pwUpperCharsHuman + pwLowerCharsHuman + pwNumbersHuman + pwSpecialCharsHuman

	crl := len(cr)
	mask := uint64(127)
	var rs strings.Builder

	num := 16

	// read random bytes, if & 127 < crl add
	for num != 0 {
		rp := make([]byte, 8)
		_, err := crand.Read(rp)
		if err != nil {
			return rs.String(), err
		}

		c := binary.BigEndian.Uint64(rp)
		if idx := int(c & mask); idx < crl {
			rs.WriteByte(cr[idx])
			num--
		}
	}

	return rs.String(), nil
}

func reloadPSKFiles(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()
	doReloadPSKFiles()
}

func getLogs(w http.ResponseWriter, r *http.Request) {
	// TODO params : --since "1 hour ago" --until "50 minutes ago"
	// 2000 entries ~2mb of data
	//data, err := exec.Command("journalctl", "-u", "docker.service", "-r", "-n", "2000", "-o", "json").Output()
	data, err := exec.Command("journalctl", "-r", "-n", "2000", "-o", "json").Output()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	logs := strings.Replace(strings.Trim(string(data), "\n"), "\n", ",", -1)
	fmt.Fprintf(w, "[%s]", logs)
}

func getCert(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/x-x509-ca-cert")
	http.ServeFile(w, r, ApiTlsCaCert)
}

func speedTest(w http.ResponseWriter, r *http.Request) {
	startParam := mux.Vars(r)["start"]
	endParam := mux.Vars(r)["end"]

	start, err := strconv.ParseUint(startParam, 10, 64)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	end, err := strconv.ParseUint(endParam, 10, 64)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if end <= start {
		http.Error(w, "Invalid range", 400)
		return
	}

	size := end - start
	maxSize := 25 * 1024 * 1024 // 25MB
	if size >= uint64(maxSize) {
		http.Error(w, "Invalid size, max 25MB", 400)
		return
	}

	sz := strconv.Itoa(int(size))

	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "text/plain")
		w.Header().Set("Content-Length", sz)

		v := make([]byte, int(size))

		for i := 0; i < int(size); i++ {
			v[i] = byte(0x30 + i%10)
		}

		w.Write(v)
	} else if r.Method == http.MethodPut {
		r.Body = http.MaxBytesReader(w, r.Body, int64(maxSize))

		// check if request body is not too large
		_, err := ioutil.ReadAll(r.Body)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		w.Header().Set("Content-Type", "text/plain")
		w.Write([]byte("ok"))
	} else {
		http.Error(w, "Invalid method", 400)
		return
	}
}

type SetupConfig struct {
	AdminPassword   string
	InterfaceUplink string
	TinyNets        []string
	CheckUpdates    bool
	ReportInstall   bool
}

func isSetupMode() bool {
	_, err := os.Stat(SetupDonePath)
	if err == nil || !os.IsNotExist(err) {
		return false
	}

	return true
}

func ReportInstall() {
	Configmtx.Lock()
	if config.ReportedInstall {
		Configmtx.Unlock()
		return
	}
	Configmtx.Unlock()

	c := http.Client{}

	defer c.CloseIdleConnections()

	req, err := http.NewRequest(http.MethodGet, "http://spr-counter.supernetworks.org/spr_counter", nil)
	if err != nil {
		log.Println("Failed to construct counter request")
		return
	}

	resp, err := c.Do(req)
	if err != nil {
		log.Println("Failed to GET on counter")
		return
	}

	Configmtx.Lock()
	config.ReportedInstall = true
	saveConfigLocked()
	Configmtx.Unlock()

	resp.Body.Close()
}

// initial setup only available if there is no user/pass configured
func setup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if !isSetupMode() {
		http.Error(w, "setup already done", 400)
		return
	}

	if r.Method != http.MethodPut {
		// TODO could list interfaces available for uplink and wifi
		fmt.Fprintf(w, "{\"status\": \"ok\"}")
		return
	}

	// setup is not done
	conf := SetupConfig{}
	err := json.NewDecoder(r.Body).Decode(&conf)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	Configmtx.Lock()
	config.ReportInstall = conf.ReportInstall
	config.CheckUpdates = conf.CheckUpdates
	Configmtx.Unlock()

	if conf.InterfaceUplink == "" || !isValidIface(conf.InterfaceUplink) {
		http.Error(w, "Invalid Uplink interface", 400)
		return
	}

	if conf.AdminPassword == "" {
		http.Error(w, "Password cannot be empty", 400)
		return
	}

	subnetRegex := regexp.MustCompile(`^(?:\d{1,3}\.){3}\d{1,3}/\d{1,2}$`)

	tinyNets := []string{}
	if len(conf.TinyNets) != 0 {
		for _, subnet := range conf.TinyNets {
			if !subnetRegex.MatchString(subnet) {
				http.Error(w, "Invalid subnet in TinyNets", 400)
				return
			}
			// Extract prefix length from subnet
			prefixStr := subnet[strings.IndexByte(subnet, '/')+1:]
			prefix, err := strconv.Atoi(prefixStr)
			if err != nil {
				http.Error(w, "Invalid prefix length for TinyNets", 400)
				return
			}

			if prefix < 8 || prefix > 24 {
				http.Error(w, "Invalid prefix length for TinyNets: "+fmt.Sprint(prefix), 400)
				return
			}

			//normalize tiny subnets and add them in
			_, normalized_net, err := net.ParseCIDR(subnet)
			if err != nil {
				http.Error(w, "Failed to parse CIDR", 400)
				return
			}
			//add normalized network range

			tinyNets = append(tinyNets, normalized_net.String())
		}
	}
	//update DHCP config
	DHCPmtx.Lock()
	gDhcpConfig.TinyNets = tinyNets
	saveDHCPConfig()
	DHCPmtx.Unlock()

	//update the firewall set of tiny nets
	FWmtx.Lock()
	for _, supernet := range tinyNets {
		addSupernetworkEntry(supernet)
	}
	FWmtx.Unlock()
	//

	// write to auth_users.json
	users := fmt.Sprintf("{%q: %q}", "admin", conf.AdminPassword)
	err = ioutil.WriteFile(AuthUsersFile, []byte(users), 0600)
	if err != nil {
		http.Error(w, "Failed to write user auth file", 400)
		panic(err)
	}

	//write to config.sh
	data, err := ioutil.ReadFile(ConfigFile)
	if err != nil {
		// we can use default template config here but better to copy it before in bash
		http.Error(w, "Missing default config.sh", 400)
		return
	}

	configData := string(data)
	matchInterfaceUplink := regexp.MustCompile(`(?m)^(WANIF)=(.*)`)

	configData = matchInterfaceUplink.ReplaceAllString(configData, "$1="+conf.InterfaceUplink)

	err = ioutil.WriteFile(ConfigFile, []byte(configData), 0600)
	if err != nil {
		http.Error(w, "Failed to write config to "+ConfigFile, 400)
		panic(err)
	}

	configureInterface("Uplink", "ethernet", conf.InterfaceUplink, false, false)

	fmt.Fprintf(w, "{\"status\": \"done\"}")
	callSuperdRestart("", "")
}

func finalizeSetup(w http.ResponseWriter, r *http.Request) {
	// disable mdns advertising and set up default multicast rules
	multicastSettingsSetupDone()

	ioutil.WriteFile(SetupDonePath, []byte("true"), 0600)

	fmt.Fprintf(w, "{\"status\": \"done\"}")
}

func multicastSettingsSetupDone() {
	//during setup we enabled mdns. disable it now by default
	Configmtx.Lock()
	settings := loadMulticastJsonLocked()
	settings.DisableMDNSAdvertise = true

	//add SSDP and MDNS to proxy defaults
	settings.Addresses = []MulticastAddress{MulticastAddress{Address: "224.0.0.251:5353"}}
	settings.Addresses = append(settings.Addresses, MulticastAddress{Address: "239.255.255.250:1900"})

	saveMulticastJsonLocked(settings)
	Configmtx.Unlock()

	loadFirewallRules()
	// set up rules for firewall as well
	FWmtx.Lock()
	gFirewallConfig.MulticastPorts = []MulticastPort{MulticastPort{Port: "5353", Upstream: false}}
	gFirewallConfig.MulticastPorts = append(gFirewallConfig.MulticastPorts, MulticastPort{Port: "1900", Upstream: false})
	saveFirewallRulesLocked()
	FWmtx.Unlock()

}

func migrateMDNS() {
	Configmtx.Lock()
	defer Configmtx.Unlock()
	settings := loadMulticastJsonLocked()

	if len(settings.Addresses) == 0 {
		//add SSDP and MDNS to proxy defaults
		settings.Addresses = append(settings.Addresses, MulticastAddress{Address: "224.0.0.251:5353"})
		settings.Addresses = append(settings.Addresses, MulticastAddress{Address: "239.255.255.250:1900"})

		//make sure config is loaded.
		loadFirewallRules()
		//also update the firewall ports for multicast
		FWmtx.Lock()
		//under setup mode do accept from upstream.
		gFirewallConfig.MulticastPorts = []MulticastPort{MulticastPort{Port: "5353", Upstream: isSetupMode()}}
		gFirewallConfig.MulticastPorts = append(gFirewallConfig.MulticastPorts, MulticastPort{Port: "5353", Upstream: false})
		saveFirewallRulesLocked()

		FWmtx.Unlock()
	}

	saveMulticastJsonLocked(settings)
}

func migrateDevicePolicies() {
	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()

	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	devices := getDevicesJson()

	updated := false

	old_groups := getGroupsJson()
	groups := []GroupEntry{}

	// rm policy groups
	for _, entry := range old_groups {
		if !slices.Contains(ValidPolicyStrings, entry.Name) {
			groups = append(groups, entry)
		} else {
			//skipping a group
			updated = true
		}
	}

	for i, dev := range devices {
		new_policies := []string{}
		new_groups := []string{}
		new_tags := []string{}

		for _, group_name := range dev.Groups {
			if slices.Contains(ValidPolicyStrings, group_name) {
				if !slices.Contains(new_policies, group_name) {
					new_policies = append(new_policies, group_name)
				}
			} else {
				new_groups = append(new_groups, group_name)
			}
		}

		for _, tag := range dev.DeviceTags {
			if slices.Contains(ValidPolicyStrings, tag) {
				if !slices.Contains(new_policies, tag) {
					new_policies = append(new_policies, tag)
				}
			} else {
				new_tags = append(new_tags, tag)
			}
		}

		if len(new_policies) != 0 || dev.Policies == nil {
			//update it
			updated = true
			dev.Policies = new_policies
			dev.Groups = new_groups
			dev.DeviceTags = new_tags
			devices[i] = dev
		}
	}

	if updated {
		log.Println("Updated device groups and tags with policies")
		saveDevicesJson(devices)
		saveGroupsJson(groups)
	}
}

// set up SPA handler. From gorilla mux's documentation
type spaHandler struct {
	staticPath string
	indexPath  string
}

func (h spaHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	path, err := filepath.Abs(r.URL.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	path = filepath.Join(h.staticPath, path)
	_, err = os.Stat(path)
	if os.IsNotExist(err) {
		http.ServeFile(w, r, filepath.Join(h.staticPath, h.indexPath))
		return
	} else if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	http.FileServer(http.Dir(h.staticPath)).ServeHTTP(w, r)
}

func setSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

func remoteIP(r *http.Request) string {
	return r.RemoteAddr
}

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		//use logStd here so we dont get dupes

		if os.Getenv("DEBUGHTTP") != "" {
			logStd.Printf("%s %s %s\n", remoteIP(r), r.Method, r.URL)

			logs := map[string]interface{}{}
			logs["remoteaddr"] = r.RemoteAddr
			logs["method"] = r.Method
			logs["path"] = r.URL.Path
			SprbusPublish("log:www:access", logs)
		}

		handler.ServeHTTP(w, r)
	})
}

var ServerEventSock = TEST_PREFIX + "/state/api/eventbus.sock"

// SprbusPublish() using default socket, make sure bytes are json
func SprbusPublish(topic string, bytes interface{}) error {

	if gSprbusClient == nil {
		return fmt.Errorf("[-] sprbus not ready yet")
	}

	value, err := json.Marshal(bytes)

	if err != nil {
		return err
	}

	_, err = gSprbusClient.Publish(topic, string(value))
	return err
}

func startEventBus() {
	// make sure the client dont connect to the prev socket
	os.Remove(ServerEventSock)

	log.Println("starting sprbus server...")

	_, err := sprbus.NewServer(ServerEventSock)
	if err != nil {
		log.Fatal(err)
	}

	// not reached
}

func registerEventClient() {
	//tbd, sprbus needs an update to allow Publish from server
	// as pub/service are private and theres no method.
	client, err := sprbus.NewClient(ServerEventSock)
	if err != nil {
		log.Fatal(err)
	}
	gSprbusClient = client
}

func main() {

	//update auth API
	migrateAuthAPI()
	//update multicast.json
	migrateMDNS()
	//v0.3.7 migration of groups into policies
	migrateDevicePolicies()

	loadConfig()

	migrateDNSSettings()

	// start eventbus
	go startEventBus()
	registerEventClient()

	// monitor for apport crashes
	go collectCrashes()

	unix_dhcpd_router := mux.NewRouter().StrictSlash(true)
	unix_wifid_router := mux.NewRouter().StrictSlash(true)
	unix_wireguard_router := mux.NewRouter().StrictSlash(true)
	external_router_authenticated := mux.NewRouter().StrictSlash(true)
	external_router_public := mux.NewRouter()
	external_router_setup := mux.NewRouter().StrictSlash(true)

	external_router_public.Use(setSecurityHeaders)
	external_router_authenticated.Use(setSecurityHeaders)
	external_router_setup.Use(setSecurityHeaders)

	//public websocket with internal authentication
	external_router_public.HandleFunc("/ws", webSocket).Methods("GET")
	external_router_public.HandleFunc("/ws_events_all", webSocketWildcard).Methods("GET")

	// intial setup
	external_router_public.HandleFunc("/setup", setup).Methods("GET", "PUT")
	external_router_setup.HandleFunc("/setup", setup).Methods("PUT")
	external_router_setup.HandleFunc("/setup_done", finalizeSetup).Methods("PUT")
	external_router_setup.HandleFunc("/ip/addr", ipAddr).Methods("GET")
	external_router_setup.HandleFunc("/hostapd/{interface}/config", hostapdConfig).Methods("GET")
	external_router_setup.HandleFunc("/hostapd/{interface}/config", hostapdUpdateConfig).Methods("PUT")
	external_router_setup.HandleFunc("/hostapd/{interface}/enable", hostapdEnableInterface).Methods("PUT")
	external_router_setup.HandleFunc("/hostapd/{interface}/status", hostapdStatus).Methods("GET")
	external_router_setup.HandleFunc("/hostapd/{interface}/setChannel", hostapdChannelSwitch).Methods("PUT")
	external_router_setup.HandleFunc("/hostapd/restart", restartWifi).Methods("PUT")
	external_router_setup.HandleFunc("/hostapd/restart_setup", restartSetupWifi).Methods("PUT")

	external_router_setup.HandleFunc("/hostapd/calcChannel", hostapdChannelCalc).Methods("PUT")
	external_router_setup.HandleFunc("/link/config", updateLinkConfig).Methods("PUT")

	external_router_setup.HandleFunc("/iw/{command:.*}", iwCommand).Methods("GET")
	//to add a new wifi device
	external_router_setup.HandleFunc("/device", handleUpdateDevice).Methods("PUT")
	external_router_setup.HandleFunc("/devices", getDevices).Methods("GET")
	external_router_setup.HandleFunc("/pendingPSK", pendingPSK).Methods("GET")

	//download cert from http
	external_router_public.HandleFunc("/cert", getCert).Methods("GET")
	external_router_authenticated.HandleFunc("/cert/authorized", getCert).Methods("GET")

	//nftable helpers
	external_router_authenticated.HandleFunc("/nfmap/{name}", showNFMap).Methods("GET")
	external_router_authenticated.HandleFunc("/nftables", listNFTables).Methods("GET")
	external_router_authenticated.HandleFunc("/nftable/{family}/{name}", showNFTable).Methods("GET")

	// firewall
	external_router_authenticated.HandleFunc("/firewall/config", getFirewallConfig).Methods("GET")
	external_router_authenticated.HandleFunc("/firewall/forward", modifyForwardRules).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/block", blockIP).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/block_forward", blockForwardingIP).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/block_output", blockOutputIP).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/service_port", modifyServicePort).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/endpoint", modifyEndpoint).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/multicast", modifyMulticast).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/icmp", modifyIcmp).Methods("PUT")
	external_router_authenticated.HandleFunc("/firewall/custom_interface", modifyCustomInterfaceRules).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/enableTLS", enableTLS).Methods("GET", "PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/systemDnsOverride", systemDNSOverride).Methods("PUT")

	//traffic monitoring
	external_router_authenticated.HandleFunc("/traffic/{name}", getDeviceTraffic).Methods("GET")
	external_router_authenticated.HandleFunc("/traffic_history", getTrafficHistory).Methods("GET")
	external_router_authenticated.HandleFunc("/iptraffic", getIPTraffic).Methods("GET")

	//ARP
	external_router_authenticated.HandleFunc("/arp", showARP).Methods("GET")

	//Misc
	external_router_authenticated.HandleFunc("/speedtest/{start:[0-9]+}-{end:[0-9]+}", speedTest).Methods("GET", "PUT", "OPTIONS")
	external_router_authenticated.HandleFunc("/ping/{interface}/{address}", pingTest).Methods("PUT")
	external_router_authenticated.HandleFunc("/ping/{interface}/{address}/udp", udpTest).Methods("PUT")
	external_router_authenticated.HandleFunc("/status", getStatus).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/restart", restart).Methods("PUT")
	external_router_authenticated.HandleFunc("/dockerPS", dockerPS).Methods("GET")
	external_router_authenticated.HandleFunc("/backup", doConfigsBackup).Methods("PUT", "OPTIONS")
	external_router_authenticated.HandleFunc("/backup/{name}", applyJwtOtpCheck(getConfigsBackup)).Methods("GET", "DELETE", "OPTIONS")
	external_router_authenticated.HandleFunc("/backup", getConfigsBackup).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/info/{name}", getInfo).Methods("GET", "OPTIONS", "PUT")
	external_router_authenticated.HandleFunc("/subnetConfig", getSetDhcpConfig).Methods("GET", "PUT", "OPTIONS")
	external_router_authenticated.HandleFunc("/setup_done", finalizeSetup).Methods("PUT")

	external_router_authenticated.HandleFunc("/dnsSettings", dnsSettings).Methods("GET", "PUT")
	external_router_authenticated.HandleFunc("/multicastSettings", multicastSettings).Methods("GET", "PUT")

	//updates, version, feature info
	external_router_authenticated.HandleFunc("/release", releaseInfo).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/releaseSet", applyJwtOtpCheck(releaseInfo)).Methods("PUT", "DELETE", "OPTIONS")
	external_router_authenticated.HandleFunc("/releaseChannels", releaseChannels).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/releasesAvailable", releasesAvailable).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/update", update).Methods("PUT", "OPTIONS")
	external_router_authenticated.HandleFunc("/version", getContainerVersion).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/features", getFeatures).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/autoupdate", autoUpdate).Methods("GET", "PUT", "DELETE")
	external_router_authenticated.HandleFunc("/checkupdates", checkUpdates).Methods("GET", "PUT", "DELETE")

	//device management
	external_router_authenticated.HandleFunc("/groups", getGroups).Methods("GET")
	external_router_authenticated.HandleFunc("/groups", updateGroups).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/devices", getDevices).Methods("GET")
	external_router_authenticated.HandleFunc("/device", applyJwtOtpCheck(getDevice)).Methods("GET")
	external_router_authenticated.HandleFunc("/device", handleUpdateDevice).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/devices", syncDevices).Methods("PUT")

	external_router_authenticated.HandleFunc("/pendingPSK", pendingPSK).Methods("GET")

	//force reload
	external_router_authenticated.HandleFunc("/reloadPSKFiles", reloadPSKFiles).Methods("PUT")

	//hostapd information
	external_router_authenticated.HandleFunc("/hostapd/{interface}/status", hostapdStatus).Methods("GET")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/all_stations", hostapdAllStations).Methods("GET")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/config", hostapdConfig).Methods("GET")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/config", hostapdUpdateConfig).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/setChannel", hostapdChannelSwitch).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/calcChannel", hostapdChannelCalc).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/enable", hostapdEnableInterface).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/disable", hostapdDisableInterface).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/resetConfiguration", hostapdResetInterface).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/enableExtraBSS", hostapdEnableExtraBSS).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/hostapd/syncMesh", hostapdSyncMesh).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/restart", restartWifi).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/restart_setup", restartSetupWifi).Methods("PUT")
	external_router_authenticated.HandleFunc("/hostapd/{interface}/failsafe", hostapdFailsafeStatus).Methods("GET")

	//ip information
	external_router_authenticated.HandleFunc("/ip/addr", ipAddr).Methods("GET")
	external_router_authenticated.HandleFunc("/ip/link/{interface}/{state}", ipLinkUpDown).Methods("PUT")
	external_router_authenticated.HandleFunc("/ip/interfaces", ipIfaceMappings).Methods("GET")

	//uplink management
	external_router_authenticated.HandleFunc("/interfacesConfiguration", getInterfacesConfiguration).Methods("GET")
	external_router_authenticated.HandleFunc("/uplink/wifi", getWpaSupplicantConfig).Methods("GET")
	external_router_authenticated.HandleFunc("/uplink/wifi", updateWpaSupplicantConfig).Methods("PUT")
	external_router_authenticated.HandleFunc("/uplink/ppp", getPPPConfig).Methods("GET")
	external_router_authenticated.HandleFunc("/uplink/ppp", updatePPPConfig).Methods("PUT")
	external_router_authenticated.HandleFunc("/uplink/ip", updateLinkIPConfig).Methods("PUT")
	external_router_authenticated.HandleFunc("/link/config", updateLinkConfig).Methods("PUT")
	external_router_authenticated.HandleFunc("/link/vlan/{interface}/{state}", updateLinkVlanTrunk).Methods("PUT")

	//	external_router_authenticated.HandleFunc("/uplink/{interface}/bond", mangeBondInterface).Methods("PUT", "DELETE")
	//	external_router_authenticated.HandleFunc("/uplink/loadBalance", setLoadBalanceStrategy).Methods("PUT")

	//iw list
	external_router_authenticated.HandleFunc("/iw/{command:.*}", iwCommand).Methods("GET")

	//logs
	external_router_authenticated.HandleFunc("/logs", getLogs).Methods("GET")

	//plugins
	external_router_authenticated.HandleFunc("/plugins", getPlugins).Methods("GET")
	external_router_authenticated.HandleFunc("/plugins/{name}", updatePlugins(external_router_authenticated, external_router_public)).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/plugins/{name}/restart", handleRestartPlugin).Methods("PUT")
	//TBD: API Docs
	external_router_authenticated.HandleFunc("/plugin/custom_compose_paths", applyJwtOtpCheck(modifyCustomComposePaths)).Methods("GET", "PUT")
	external_router_authenticated.HandleFunc("/plugin/install_user_url", installUserPluginGitUrl(external_router_authenticated, external_router_public)).Methods("PUT")
	external_router_authenticated.HandleFunc("/plugin/download_info", applyJwtOtpCheck(downloadUserPluginInfo)).Methods("PUT")
	external_router_authenticated.HandleFunc("/plugin/complete_install", completeUserPluginInstall(external_router_authenticated, external_router_public)).Methods("PUT")
	external_router_authenticated.HandleFunc("/plusToken", plusToken).Methods("GET", "PUT")
	external_router_authenticated.HandleFunc("/plusTokenValid", plusTokenValid).Methods("GET")
	external_router_authenticated.HandleFunc("/stopPlusExtension", stopPlusExt).Methods("PUT")
	external_router_authenticated.HandleFunc("/startPlusExtension", startPlusExt).Methods("PUT")

	// Auth api
	external_router_authenticated.HandleFunc("/tokens", applyJwtOtpCheck(getAuthTokens)).Methods("GET")
	external_router_authenticated.HandleFunc("/tokens", applyJwtOtpCheck(updateAuthTokens)).Methods("PUT", "DELETE")

	external_router_authenticated.HandleFunc("/otp_register", otpRegister).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/otp_validate", generateOTPToken).Methods("PUT")
	external_router_authenticated.HandleFunc("/otp_status", otpStatus).Methods("GET")
	external_router_authenticated.HandleFunc("/otp_jwt_test", applyJwtOtpCheck(testJWTOTP)).Methods("PUT")

	// alerts
	external_router_authenticated.HandleFunc("/alerts", getAlertSettings).Methods("GET")
	external_router_authenticated.HandleFunc("/alerts", modifyAlertSettings).Methods("PUT")
	external_router_authenticated.HandleFunc("/alerts/{index:[0-9]+}", modifyAlertSettings).Methods("DELETE", "PUT")
	external_router_authenticated.HandleFunc("/alerts_register_ios", registerAlertDevice).Methods("DELETE", "PUT", "GET")
	external_router_authenticated.HandleFunc("/alerts_mobile_proxy", alertsMobileProxySettings).Methods("PUT", "GET")
	external_router_authenticated.HandleFunc("/alerts_test/{deviceToken:[0-9a-h]+}", testSendAlertDevice).Methods("PUT")

	// allow leaf nodes to report PSK events also
	external_router_authenticated.HandleFunc("/reportPSKAuthSuccess", reportPSKAuthSuccess).Methods("PUT")
	external_router_authenticated.HandleFunc("/reportPSKAuthFailure", reportPSKAuthFailure).Methods("PUT")
	external_router_authenticated.HandleFunc("/reportDisconnect", reportDisconnect).Methods("PUT")

	// PSK management for stations
	unix_wifid_router.HandleFunc("/reportPSKAuthFailure", reportPSKAuthFailure).Methods("PUT")
	unix_wifid_router.HandleFunc("/reportPSKAuthSuccess", reportPSKAuthSuccess).Methods("PUT")
	unix_wifid_router.HandleFunc("/reportDisconnect", reportDisconnect).Methods("PUT")
	unix_wifid_router.HandleFunc("/interfaces", getEnabledAPInterfaces).Methods("GET")
	unix_wifid_router.HandleFunc("/interfaces_virtual_bss", getEnabledVirtualBSSInterfaces).Methods("GET")

	// DHCP actions
	unix_dhcpd_router.HandleFunc("/dhcpRequest", dhcpRequest).Methods("PUT")
	unix_dhcpd_router.HandleFunc("/abstractDhcpRequest", abstractDhcpRequest).Methods("PUT")

	// Wireguard actions
	unix_wireguard_router.HandleFunc("/wireguardUpdate", wireguardUpdate).Methods("PUT", "DELETE")

	os.Remove(UNIX_WIFID_LISTENER)
	unixWifidListener, err := net.Listen("unix", UNIX_WIFID_LISTENER)
	if err != nil {
		panic(err)
	}

	os.Remove(UNIX_DHCPD_LISTENER)
	unixDhcpdListener, err := net.Listen("unix", UNIX_DHCPD_LISTENER)
	if err != nil {
		panic(err)
	}

	// 1. Wireguard may be disabled and the path might not exist,
	// 2. The container has not started yet for the first time
	// -> Make the directory path regardless
	_ = os.MkdirAll(UNIX_WIREGUARD_LISTENER_PATH, 0664)
	os.Remove(UNIX_WIREGUARD_LISTENER)
	unixWireguardListener, err := net.Listen("unix", UNIX_WIREGUARD_LISTENER)
	if err != nil {
		panic(err)
	}

	initAuth()
	//set up dhcp
	initDHCP()
	//initialize firewall rules
	initFirewallRules()
	//initialize hostap  related items
	initRadios()
	//start the websocket handler
	WSRunNotify()
	// collect traffic accounting statistics
	trafficTimer()

	// alerts, connect to eventbus
	go AlertsRunEventListener()
	//listen and cache dns
	go DNSEventListener()

	// updates when enabled. not implemented yet
	go runAutoUpdates()

	// publish static files for plugins before spa handler
	PluginRoutes(external_router_authenticated, external_router_public)

	spa := spaHandler{staticPath: "/ui", indexPath: "index.html"}
	external_router_public.PathPrefix("/").Handler(spa)

	wifidServer := http.Server{Handler: logRequest(unix_wifid_router)}
	dhcpdServer := http.Server{Handler: logRequest(unix_dhcpd_router)}
	wireguardServer := http.Server{Handler: logRequest(unix_wireguard_router)}

	headersOk := handlers.AllowedHeaders([]string{"X-Requested-With", "Content-Type", "Authorization", "SPR-Bearer", "X-JWT-OTP"})
	originsOk := handlers.AllowedOrigins([]string{"*"})
	methodsOk := handlers.AllowedMethods([]string{"GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"})

	sslPort, runSSL := os.LookupEnv("API_SSL_PORT")

	if runSSL {
		listenPort, err := strconv.Atoi(sslPort)
		if err != nil {
			listenPort = 443
		}

		listenAddr := fmt.Sprint("0.0.0.0:", listenPort)

		go http.ListenAndServeTLS(listenAddr, ApiTlsCert, ApiTlsKey, logRequest(handlers.CORS(originsOk, headersOk, methodsOk)(Authenticate(external_router_authenticated, external_router_public, external_router_setup))))
	}

	go http.ListenAndServe("0.0.0.0:80", logRequest(handlers.CORS(originsOk, headersOk, methodsOk)(Authenticate(external_router_authenticated, external_router_public, external_router_setup))))

	go wifidServer.Serve(unixWifidListener)

	go dhcpdServer.Serve(unixDhcpdListener)

	if isSetupMode() {
		setupAPInit()

		withRetry(10, 3, func() error {
			ret := startExtension("wifid-setup/docker-compose.yml")
			if ret == false {
				return fmt.Errorf("failed to start wifid")
			}
			return nil
		})

	}

	wireguardServer.Serve(unixWireguardListener)
}
