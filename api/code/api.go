package main

import (
	"bufio"
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

var DevicesConfigPath = TEST_PREFIX + "/configs/devices/"
var DevicesConfigFile = DevicesConfigPath + "devices.json"
var DevicesPublicConfigFile = TEST_PREFIX + "/state/public/devices-public.json"
var ConfigBackupDirectory = TEST_PREFIX + "/state/backups"

var GroupsConfigFile = DevicesConfigPath + "groups.json"

var ConfigFile = TEST_PREFIX + "/configs/base/config.sh"
var DNSConfigFile = TEST_PREFIX + "/configs/dns/Corefile"
var MulticastConfigFile = TEST_PREFIX + "/configs/base/multicast.json"

var ApiTlsCert = "/configs/base/www-api.crt"
var ApiTlsKey = "/configs/base/www-api.key"

var SuperdSocketPath = TEST_PREFIX + "/state/plugins/superd/socket"

// NOTE .Fire will dial, print to stdout/stderr if sprbus not started
var log = sprbus.NewLog("log:api")

type InfluxConfig struct {
	URL    string
	Org    string
	Bucket string
	Token  string
}

type DNSSettings struct {
	UpstreamTLSHost   string
	UpstreamIPAddress string
	TlsDisable        bool
}

type MulticastAddress struct {
	Address  string //adderss:port pair
	Disabled bool
	Tag      string
}

type MulticastSettings struct {
	Addresses []MulticastAddress
}

type APIConfig struct {
	InfluxDB   InfluxConfig
	Plugins    []PluginConfig
	PlusToken  string
	AutoUpdate bool
	DNS        DNSSettings
}

type GroupEntry struct {
	Name                string
	Disabled            bool
	GroupTags           []string
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
	Name          string
	MAC           string
	WGPubKey      string
	VLANTag       string
	RecentIP      string
	PSKEntry      PSKEntry
	Groups        []string
	DeviceTags    []string
	DHCPFirstTime string
	DHCPLastTime  string
	Style         DeviceStyle
}

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

	before := len(config.Plugins)
	updateConfigPluginDefaults(&config)

	if len(config.Plugins) != before {
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
		http.Error(w, "Not found", 404)
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
	if os.Getenv("VIRTUAL_SPR") == "" {
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

// system info: uptime, docker ps etc.
func getInfo(w http.ResponseWriter, r *http.Request) {
	DockerSocketPath := "/var/run/docker.sock"

	name := mux.Vars(r)["name"]

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
			io.WriteString(stdin, string(output))
		}()

		data, err = cmd.Output()
	} else if name == "docker" {
		c := http.Client{}
		c.Transport = &http.Transport{
			Dial: func(network, addr string) (net.Conn, error) {
				return net.Dial("unix", DockerSocketPath)
			},
		}
		defer c.CloseIdleConnections()

		req, err := http.NewRequest(http.MethodGet, "http://localhost/v1.41/containers/json?all=1", nil)
		if err != nil {
			http.Error(w, err.Error(), 404)
			return
		}

		resp, err := c.Do(req)
		if err != nil {
			http.Error(w, err.Error(), 404)
			return
		}

		defer resp.Body.Close()
		data, err = ioutil.ReadAll(resp.Body)
	} else if name == "hostname" {
		hostname, err := os.Hostname()
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		data = []byte(fmt.Sprintf("%q", hostname))
	} else if name == "ss" {
		data, err = exec.Command("jc", "-p", "ss", "-4", "-n").Output()
	} else {
		http.Error(w, "Invalid info", 404)
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

func checkUpdates() {

	//once an hour, check if auto updates are enabled
	// if they are, then performan an update
	ticker := time.NewTicker(1 * time.Hour)
	for {
		select {
		case <-ticker.C:
			if config.AutoUpdate == true {
				//TBD 1) check a release has aged?
				//    2) check that a release is up to date

				//performUpdate()
			}
		}
	}
}

func parseDNSCorefile() DNSSettings {
	settings := DNSSettings{}

	file, err := os.Open(DNSConfigFile)
	if err != nil {
		fmt.Printf("Error opening file: %v\n", err)
		return settings
	}
	defer file.Close()

	ipRegex := regexp.MustCompile(`\b(?:[a-zA-Z]+:\/\/)?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`)
	serverNameRegex := regexp.MustCompile(`tls_servername\s+([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})`)

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "forward . ") {
			ipMatch := ipRegex.FindStringSubmatch(line)
			if len(ipMatch) > 1 {
				settings.UpstreamIPAddress = ipMatch[1]
			}
		}
		if strings.Contains(line, "tls_servername") {
			serverNameMatch := serverNameRegex.FindStringSubmatch(line)
			if len(serverNameMatch) > 1 {
				settings.UpstreamTLSHost = serverNameMatch[1]
			}
		}
	}

	if settings.UpstreamIPAddress != "" && settings.UpstreamTLSHost == "" {
		settings.TlsDisable = true
	}

	return settings
}

func updateDNSCorefile(dns DNSSettings) {
	// Read the file
	file, err := os.Open(DNSConfigFile)
	if err != nil {
		fmt.Printf("Error opening file: %v\n", err)
		return
	}
	defer file.Close()

	ipRegex := regexp.MustCompile(`\b(?:[a-zA-Z]+:\/\/)?\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b`)
	serverNameRegex := regexp.MustCompile(`tls_servername\s+([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,})`)

	var updatedLines []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.Contains(line, "forward . ") {
			if dns.TlsDisable == true {
				line = ipRegex.ReplaceAllString(line, "") // Replace with the new IP
				line = line + dns.UpstreamIPAddress + " {"
			} else {
				line = ipRegex.ReplaceAllString(line, "") // Replace with the new IP
				line = line + "tls://" + dns.UpstreamIPAddress + " {"
			}
		}
		if !dns.TlsDisable && strings.Contains(line, "tls_servername") {
			line = serverNameRegex.ReplaceAllString(line, "tls_servername "+dns.UpstreamTLSHost) // Replace with the new server name
		}
		updatedLines = append(updatedLines, line)
	}
	if err := scanner.Err(); err != nil {
		fmt.Printf("Error reading file: %v\n", err)
		return
	}

	// Write the updated content back to the file
	outputFile, err := os.Create(DNSConfigFile)
	if err != nil {
		fmt.Printf("Error creating file: %v\n", err)
		return
	}
	defer outputFile.Close()
	writer := bufio.NewWriter(outputFile)
	for _, line := range updatedLines {
		_, err := writer.WriteString(line + "\n")
		if err != nil {
			fmt.Printf("Error writing to file: %v\n", err)
			return
		}
	}
	writer.Flush()
}

func dnsSettings(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	if r.Method == http.MethodPut {
		settings := DNSSettings{}
		err := json.NewDecoder(r.Body).Decode(&settings)
		if err != nil {
			http.Error(w, fmt.Errorf("failed to deserialize settings").Error(), 400)
			return
		}

		new_ip := net.ParseIP(settings.UpstreamIPAddress)
		if new_ip == nil {
			http.Error(w, fmt.Errorf("Invalid IP Address for DNS").Error(), 400)
			return
		}

		if settings.TlsDisable == true && settings.UpstreamTLSHost != "" {
			http.Error(w, fmt.Errorf("Unexpected TLS Host when TLS is disabled").Error(), 400)
			return
		}

		const dnsPattern = `^(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,6}\.?)$`
		dnsRegex := regexp.MustCompile(dnsPattern)
		if settings.TlsDisable == false && !dnsRegex.MatchString(settings.UpstreamTLSHost) {
			http.Error(w, fmt.Errorf("Invalid DNS TLS host name").Error(), 400)
			return
		}

		config.DNS = settings
		saveConfigLocked()
		updateDNSCorefile(config.DNS)
		callSuperdRestart("", "dns")
	} else {
		//migrate the settings, if dns is empty, parse the file
		if config.DNS.UpstreamIPAddress == "" {
			ret := parseDNSCorefile()
			if ret.UpstreamIPAddress != "" {
				config.DNS = ret
				saveConfigLocked()
				updateDNSCorefile(config.DNS)
				callSuperdRestart("", "dns")
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config.DNS)
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
		saveConfig()
		// fall thru 200
		return
	}

	config.AutoUpdate = true
	saveConfig()
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

	append := "?" + params.Encode()

	creds := GhcrCreds{PlusUser, config.PlusToken}
	jsonValue, _ := json.Marshal(creds)

	req, err := http.NewRequest(http.MethodPost, "http://localhost/remote_container_tags"+append, bytes.NewBuffer(jsonValue))
	if err != nil {
		http.Error(w, fmt.Errorf("failed to make request for tags "+container).Error(), 400)
		return
	}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		http.Error(w, fmt.Errorf("failed to request tags from superd "+append).Error(), 400)
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tagsResp.Tags)
}

func releaseChannels(w http.ResponseWriter, r *http.Request) {
	reply := []string{"main", "-dev"}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(reply)
}

func getContainerVersion(w http.ResponseWriter, r *http.Request) {
	container := r.URL.Query().Get("plugin")
	params := url.Values{}
	params.Set("container", container)

	req, err := http.NewRequest(http.MethodGet, "http://localhost/container_version?"+params.Encode(), nil)
	if err != nil {
		http.Error(w, fmt.Errorf("failed to make request for version "+container).Error(), 400)
		return
	}

	c := getSuperdClient()
	defer c.CloseIdleConnections()

	resp, err := c.Do(req)
	if err != nil {
		http.Error(w, fmt.Errorf("failed to request version from superd "+container).Error(), 400)
		return
	}

	defer resp.Body.Close()

	version := ""
	err = json.NewDecoder(resp.Body).Decode(&version)
	if err != nil {
		http.Error(w, fmt.Errorf("failed to get version for %s", container).Error(), 400)
		return
	}

	if resp.StatusCode != http.StatusOK {
		http.Error(w, fmt.Errorf("failed to get version %s", container+" "+fmt.Sprint(resp.StatusCode)).Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(version)
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

func restart(w http.ResponseWriter, r *http.Request) {
	//restart all containers
	go callSuperdRestart("", "")
}

var Devicesmtx sync.Mutex

func convertDevicesPublic(devices map[string]DeviceEntry) map[string]DeviceEntry {
	// do not pass PSK key material
	scrubbed_devices := make(map[string]DeviceEntry)
	for i, entry := range devices {
		new_entry := entry
		if new_entry.PSKEntry.Psk != "" {
			new_entry.PSKEntry.Psk = "**"
		}
		scrubbed_devices[i] = new_entry
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

	sprbus.Publish("devices:save", scrubbed_devices)
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

func syncDevices(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	devices := map[string]DeviceEntry{}
	err := json.NewDecoder(r.Body).Decode(&devices)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	saveDevicesJson(devices)

	for _, val := range devices {
		refreshDeviceGroups(val)
		refreshDeviceTags(val)
	}

	doReloadPSKFiles()
}

func updateDevice(w http.ResponseWriter, r *http.Request, dev DeviceEntry, identity string) (string, int) {

	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()
	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()

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

	//normalize groups and tags
	dev.Groups = normalizeStringSlice(dev.Groups)
	dev.DeviceTags = normalizeStringSlice(dev.DeviceTags)
	dev.MAC = trimLower(dev.MAC)

	val, exists := devices[identity]

	if r.Method == http.MethodDelete {
		//delete a device
		if exists {
			delete(devices, identity)
			saveDevicesJson(devices)
			refreshDeviceGroups(val)
			doReloadPSKFiles()

			//if the device had a VLAN Tag, also refresh vlans
			// upon deletion
			if val.VLANTag != "" {
				Devicesmtx.Unlock()
				Groupsmtx.Unlock()
				refreshVLANTrunks()
				Devicesmtx.Lock()
				Groupsmtx.Lock()
			}

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
				val.RecentIP = new_ip.String()
				refreshIP = true
			} else {
				if new_ip == nil {
					return "Invalid IP assignment", 400
				} else {
					return "IP assignment not in configured IP ranges", 400
				}
			}
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

			saveGroups := false

			//create a new zone if it does not exist yet
			for _, entry := range dev.Groups {
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

			refreshGroups = true
		}

		if dev.Style.Icon != "" {
			val.Style.Icon = dev.Style.Icon
		}

		if dev.Style.Color != "" {
			val.Style.Color = dev.Style.Color
		}

		devices[identity] = val
		saveDevicesJson(devices)

		if pskModified {
			//psks updated -- update hostapd
			doReloadPSKFiles()
		}

		if refreshGroups {
			refreshDeviceGroups(val)
		}

		if refreshTags {
			refreshDeviceTags(val)
		}

		if refreshIP {
			if val.MAC != "" {
				iface := getRouteInterface(val.RecentIP)
				if iface != "" {
					//if the device is currently routed, then update it
					handleDHCPResult(val.MAC, val.RecentIP, "", iface)
				}
			}

		}

		//locks no longer needed

		if refreshVlanTrunks {
			Devicesmtx.Unlock()
			Groupsmtx.Unlock()
			refreshVLANTrunks()
			Devicesmtx.Lock()
			Groupsmtx.Lock()
		}

		//mask the PSK if set and not generated
		if val.PSKEntry.Psk != "" && pskGenerated == false {
			val.PSKEntry.Psk = "**"
		}

		sprbus.Publish("device:update", val)

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

	if len(dev.Groups) != 0 {
		//update verdict maps for the device
		refreshGroups = true
	}

	devices[identity] = dev
	saveDevicesJson(devices)

	sprbus.Publish("device:save", dev)

	if pskModified {
		//psks updated -- update hostapd
		doReloadPSKFiles()
	}

	if refreshGroups {
		refreshDeviceGroups(val)
	}

	if pskGenerated == false {
		dev.PSKEntry.Psk = "**"
	}

	// create vlans
	if refreshVlanTrunks {
		Devicesmtx.Unlock()
		Groupsmtx.Unlock()
		refreshVLANTrunks()
		Devicesmtx.Lock()
		Groupsmtx.Lock()
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
		ret = append(ret, trimLower(entry))
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
	builtin_maps  = []string{"internet_access", "dns_access", "lan_access", "ethernet_filter"}
	default_zones = []string{"isolated", "lan", "wan", "dns"}
)

func getVerdictMapNames() []string {
	//get custom maps from zones
	custom_maps := []string{}
	zones := getGroupsJson()
	for _, z := range zones {
		skip := false
		for _, y := range default_zones {
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
	cmd := exec.Command("nft", "-j", "list", "map", "inet", "filter", map_name)
	stdout, err := cmd.Output()
	if err != nil {
		return existing
	}

	//jq .nftables[1].map.elem[][0].concat
	var data map[string]interface{}
	err = json.Unmarshal(stdout, &data)
	data2, ok := data["nftables"].([]interface{})
	if ok != true {
		log.Fatal("invalid json")
	}
	data3, ok := data2[1].(map[string]interface{})
	data4, ok := data3["map"].(map[string]interface{})
	data5, ok := data4["elem"].([]interface{})
	for _, d := range data5 {
		e, ok := d.([]interface{})
		f, ok := e[0].(map[string]interface{})
		g, ok := f["concat"].([]interface{})
		if ok {
			first, _ := g[0].(string)
			second, second_ok := g[1].(string)
			if len(g) > 2 {
				third, third_ok := g[2].(string)
				if third_ok {
					existing = append(existing, verdictEntry{first, second, third})
				}
			} else {
				if second_ok {
					if map_name == "dhcp_access" {
						// type ifname . ether_addr : verdict (no IP)
						existing = append(existing, verdictEntry{"", first, second})
					} else {
						// for _dst_access
						// type ipv4_addr . ifname : verdict (no MAC)
						existing = append(existing, verdictEntry{first, second, ""})
					}
				}
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

func updateAddr(Router string, Ifname string) {
	exec.Command("ip", "addr", "add", Router+"/30", "dev", Ifname).Run()
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
		if ip == IP || entryName == hostname {
			continue
		}
		new_data += ip + " " + hostname + "\n"
	}
	new_data += IP + " " + entryName + "\n"
	ioutil.WriteFile(localMappingsPath, []byte(new_data), 0644)
}

func flushRoute(MAC string) {
	arp_entry, err := GetArpEntryFromMAC(MAC)
	if err != nil {
		log.Println("Arp entry not found, insufficient information to refresh", MAC)
		return
	}

	if !isTinyNetIP(arp_entry.IP) {
		log.Println("[] Error: Trying to flush non tiny IP: ", arp_entry.IP)
		return
	}
	//delete previous arp entry and route
	router := RouterFromTinyIP(arp_entry.IP)
	exec.Command("ip", "addr", "del", router, "dev", arp_entry.Device).Run()
	exec.Command("arp", "-i", arp_entry.Device, "-d", arp_entry.IP).Run()
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

func refreshDeviceTags(dev DeviceEntry) {
	applyPrivateNetworkUpstreamDevice(dev)
	sprbus.Publish("device:tags:update", dev)
}

func refreshDeviceGroups(dev DeviceEntry) {
	if dev.WGPubKey != "" {
		//refresh wg based on WGPubKey
		refreshWireguardDevice(dev.MAC, dev.RecentIP, dev.WGPubKey, "wg0", "", true)
	}

	ifname := ""
	ipv4 := dev.RecentIP

	if ipv4 == "" {
		//check arp tables for the MAC to get the IP
		arp_entry, err := GetArpEntryFromMAC(dev.MAC)
		if err == nil {
			ipv4 = arp_entry.IP
		} else {
			log.Println("Missing IP for device, could not refresh device groups with MAC " + dev.MAC)
			return
		}
	}

	//check dhcp vmap for the interface
	entries := getNFTVerdictMap("dhcp_access")
	for _, entry := range entries {
		if equalMAC(entry.mac, dev.MAC) {
			ifname = entry.ifname
		}
	}

	if ifname == "" {
		ifname = getRouteInterface(dev.RecentIP)
	}

	if ifname == "" {
		log.Println("dhcp_access entry not found, route not found, insufficient information to refresh", dev.RecentIP)
		return
	}

	//remove from existing verdict maps
	flushVmaps(ipv4, dev.MAC, ifname, getVerdictMapNames(), isAPVlan(ifname))

	//add this MAC and IP to the ethernet filter
	addVerdictMac(ipv4, dev.MAC, ifname, "ethernet_filter", "return")

	//and re-add
	populateVmapEntries(ipv4, dev.MAC, ifname, "")

	sprbus.Publish("device:groups:update", dev)
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

func reportPSKAuthFailure(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	pskf := PSKAuthFailure{}
	err := json.NewDecoder(r.Body).Decode(&pskf)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	sprbus.Publish("wifi:auth:fail", pskf)

	if pskf.MAC == "" || (pskf.Type != "sae" && pskf.Type != "wpa") || (pskf.Reason != "noentry" && pskf.Reason != "mismatch") {
		http.Error(w, "malformed data", 400)
		return
	}

	updateMeshPluginConnectFailure(pskf)

	//no longer assign MAC on Auth Failure due to noentry
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pskf)
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

func reportPSKAuthSuccess(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	pska := PSKAuthSuccess{}
	err := json.NewDecoder(r.Body).Decode(&pska)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	sprbus.Publish("wifi:auth:success", pska)

	if pska.Iface == "" || pska.Event != "AP-STA-CONNECTED" || pska.MAC == "" {
		http.Error(w, "malformed data", 400)
		return
	}

	pska.Status = "Okay"

	//check if there is a pending psk to assign. if the mac is not known, then it was the pending psk

	devices := getDevicesJson()
	pendingPsk, exists := devices["pending"]
	if exists {
		var foundPSK = false
		for _, device := range devices {
			if device.MAC == pska.MAC {
				foundPSK = true
				break
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

	sprbus.Publish("wifi:station:disconnect", event)

	if event.Iface == "" || event.Event != "AP-STA-DISCONNECTED" || event.MAC == "" {
		http.Error(w, "malformed data", 400)
		return
	}

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
	w.Header().Set("Content-Type", "text/plain")
	http.ServeFile(w, r, ApiTlsCert)
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
	SSID            string
	CountryCode     string
	AdminPassword   string
	InterfaceAP     string
	InterfaceUplink string
	TinyNets        []string
}

func isSetupMode() bool {
	_, err := os.Stat(AuthUsersFile)
	if err == nil || !os.IsNotExist(err) {
		return false
	}

	return true
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

	validCountry := regexp.MustCompile(`^[A-Z]{2}$`).MatchString // EN,SE
	//SSID: up to 32 alphanumeric, case-sensitive, characters
	//Invalid characters: +, ], /, ", TAB, and trailing spaces
	//The first character cannot be !, #, or ; character
	validSSID := regexp.MustCompile(`^[^!#;+\]\/"\t][^+\]\/"\t]{0,30}[^ +\]\/"\t]$|^[^ !#;+\]\/"\t]$[ \t]+$`).MatchString

	if conf.InterfaceAP == "" || !isValidIface(conf.InterfaceAP) {
		http.Error(w, "Invalid AP interface", 400)
		return
	}

	if conf.InterfaceUplink == "" || !isValidIface(conf.InterfaceUplink) {
		http.Error(w, "Invalid Uplink interface", 400)
		return
	}

	if !validSSID(conf.SSID) {
		http.Error(w, "Invalid SSID", 400)
		return
	}

	// TODO country => channels
	if !validCountry(conf.CountryCode) {
		http.Error(w, "Invalid Country Code", 400)
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
				http.Error(w, "Invalid prefix length for TinyNets: "+string(prefix), 400)
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
	err = ioutil.WriteFile(AuthUsersFile, []byte(users), 0644)
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

	err = ioutil.WriteFile(ConfigFile, []byte(configData), 0755)
	if err != nil {
		http.Error(w, "Failed to write config to "+ConfigFile, 400)
		panic(err)
	}

	//generate and write to hostapd_iface.conf
	data, err = ioutil.ReadFile(getHostapdConfigPath("template"))
	if err != nil {
		// we can use default template config here but better to copy it before in bash
		http.Error(w, "Missing default hostapd config", 400)
		return
	}

	configData = string(data)
	matchSSID := regexp.MustCompile(`(?m)^(ssid)=(.*)`)
	matchInterfaceAP := regexp.MustCompile(`(?m)^(interface)=(.*)`)
	matchCountry := regexp.MustCompile(`(?m)^(country_code)=(.*)`)
	matchControl := regexp.MustCompile(`(?m)^(ctrl_interface)=(.*)`)

	configData = matchSSID.ReplaceAllString(configData, "$1="+conf.SSID)
	configData = matchInterfaceAP.ReplaceAllString(configData, "$1="+conf.InterfaceAP)
	configData = matchCountry.ReplaceAllString(configData, "$1="+conf.CountryCode)
	configData = matchControl.ReplaceAllString(configData, "$1="+"/state/wifi/control_"+conf.InterfaceAP)

	hostapd_path := getHostapdConfigPath(conf.InterfaceAP)
	err = ioutil.WriteFile(hostapd_path, []byte(configData), 0755)
	if err != nil {
		http.Error(w, "Failed to write config to "+hostapd_path, 400)
		panic(err)
	}

	configureInterface("AP", "", conf.InterfaceAP)
	configureInterface("Uplink", "ethernet", conf.InterfaceUplink)

	fmt.Fprintf(w, "{\"status\": \"done\"}")
	callSuperdRestart("", "")
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

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		//use logStd here so we dont get dupes
		logStd.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)

		logs := map[string]interface{}{}
		logs["remoteaddr"] = r.RemoteAddr
		logs["method"] = r.Method
		logs["path"] = r.URL.Path
		sprbus.Publish("log:www:access", logs)

		handler.ServeHTTP(w, r)
	})
}

var ServerEventSock = "/state/api/eventbus.sock"

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

func main() {

	//update auth API
	migrateAuthAPI()

	loadConfig()

	// start eventbus
	go startEventBus()

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

	// intial setup
	external_router_public.HandleFunc("/setup", setup).Methods("GET", "PUT")
	external_router_setup.HandleFunc("/ip/addr", ipAddr).Methods("GET")
	external_router_setup.HandleFunc("/hostapd/{interface}/config", hostapdConfig).Methods("GET")
	external_router_setup.HandleFunc("/hostapd/{interface}/config", hostapdUpdateConfig).Methods("PUT")
	external_router_setup.HandleFunc("/hostapd/{interface}/setChannel", hostapdChannelSwitch).Methods("PUT")
	external_router_setup.HandleFunc("/hostapd/calcChannel", hostapdChannelCalc).Methods("PUT")
	external_router_setup.HandleFunc("/iw/{command:.*}", iwCommand).Methods("GET")

	//download cert from http
	external_router_public.HandleFunc("/cert", getCert).Methods("GET")

	spa := spaHandler{staticPath: "/ui", indexPath: "index.html"}
	external_router_public.PathPrefix("/").Handler(spa)

	//nftable helpers
	external_router_authenticated.HandleFunc("/nfmap/{name}", showNFMap).Methods("GET")
	external_router_authenticated.HandleFunc("/nftables", listNFTables).Methods("GET")
	external_router_authenticated.HandleFunc("/nftable/{family}/{name}", showNFTable).Methods("GET")

	// firewall
	external_router_authenticated.HandleFunc("/firewall/config", getFirewallConfig).Methods("GET")
	external_router_authenticated.HandleFunc("/firewall/forward", modifyForwardRules).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/block", blockIP).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/block_forward", blockForwardingIP).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/service_port", modifyServicePort).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/firewall/endpoint", modifyEndpoint).Methods("PUT", "DELETE")

	//traffic monitoring
	external_router_authenticated.HandleFunc("/traffic/{name}", getDeviceTraffic).Methods("GET")
	external_router_authenticated.HandleFunc("/traffic_history", getTrafficHistory).Methods("GET")
	external_router_authenticated.HandleFunc("/iptraffic", getIPTraffic).Methods("GET")

	//ARP
	external_router_authenticated.HandleFunc("/arp", showARP).Methods("GET")

	//Misc
	external_router_authenticated.HandleFunc("/status", getStatus).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/restart", restart).Methods("PUT")
	external_router_authenticated.HandleFunc("/backup", doConfigsBackup).Methods("PUT", "OPTIONS")
	external_router_authenticated.HandleFunc("/backup/{name}", getConfigsBackup).Methods("GET", "DELETE", "OPTIONS")
	external_router_authenticated.HandleFunc("/backup", getConfigsBackup).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/info/{name}", getInfo).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/subnetConfig", getSetDhcpConfig).Methods("GET", "PUT", "OPTIONS")

	external_router_authenticated.HandleFunc("/dnsSettings", dnsSettings).Methods("GET", "PUT")
	external_router_authenticated.HandleFunc("/multicastSettings", multicastSettings).Methods("GET", "PUT")

	//updates, version, feature info
	external_router_authenticated.HandleFunc("/release", releaseInfo).Methods("GET", "PUT", "DELETE", "OPTIONS")
	external_router_authenticated.HandleFunc("/releaseChannels", releaseChannels).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/releasesAvailable", releasesAvailable).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/update", update).Methods("PUT", "OPTIONS")
	external_router_authenticated.HandleFunc("/version", getContainerVersion).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/features", getFeatures).Methods("GET", "OPTIONS")
	external_router_authenticated.HandleFunc("/autoupdate", autoUpdate).Methods("GET", "PUT", "DELETE")

	//device management
	external_router_authenticated.HandleFunc("/groups", getGroups).Methods("GET")
	external_router_authenticated.HandleFunc("/groups", updateGroups).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/devices", getDevices).Methods("GET")
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

	//ip information
	external_router_authenticated.HandleFunc("/ip/addr", ipAddr).Methods("GET")
	external_router_authenticated.HandleFunc("/ip/link/{interface}/{state}", ipLinkUpDown).Methods("PUT")

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
	external_router_authenticated.HandleFunc("/plugins/{name}", updatePlugins(external_router_authenticated)).Methods("PUT", "DELETE")
	external_router_authenticated.HandleFunc("/plugins/{name}/restart", handleRestartPlugin).Methods("PUT")
	external_router_authenticated.HandleFunc("/plusToken", plusToken).Methods("GET", "PUT")
	external_router_authenticated.HandleFunc("/stopPlusExtension", stopPlusExt).Methods("PUT")
	external_router_authenticated.HandleFunc("/startPlusExtension", startPlusExt).Methods("PUT")

	// tokens api
	external_router_authenticated.HandleFunc("/tokens", getAuthTokens).Methods("GET")
	external_router_authenticated.HandleFunc("/tokens", updateAuthTokens).Methods("PUT", "DELETE")

	external_router_authenticated.HandleFunc("/speedtest/{start:[0-9]+}-{end:[0-9]+}", speedTest).Methods("GET", "PUT", "OPTIONS")

	// notifications
	external_router_authenticated.HandleFunc("/notifications", getNotificationSettings).Methods("GET")
	external_router_authenticated.HandleFunc("/notifications", modifyNotificationSettings).Methods("DELETE", "PUT")
	external_router_authenticated.HandleFunc("/notifications/{index:[0-9]+}", modifyNotificationSettings).Methods("DELETE", "PUT")

	// allow leaf nodes to report PSK events also
	external_router_authenticated.HandleFunc("/reportPSKAuthSuccess", reportPSKAuthSuccess).Methods("PUT")
	external_router_authenticated.HandleFunc("/reportPSKAuthFailure", reportPSKAuthFailure).Methods("PUT")
	external_router_authenticated.HandleFunc("/reportDisconnect", reportDisconnect).Methods("PUT")

	// PSK management for stations
	unix_wifid_router.HandleFunc("/reportPSKAuthFailure", reportPSKAuthFailure).Methods("PUT")
	unix_wifid_router.HandleFunc("/reportPSKAuthSuccess", reportPSKAuthSuccess).Methods("PUT")
	unix_wifid_router.HandleFunc("/reportDisconnect", reportDisconnect).Methods("PUT")
	unix_wifid_router.HandleFunc("/interfaces", getEnabledAPInterfaces).Methods("GET")

	// DHCP actions
	unix_dhcpd_router.HandleFunc("/dhcpUpdate", dhcpUpdate).Methods("PUT") //deprecated now
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

	PluginRoutes(external_router_authenticated)

	wifidServer := http.Server{Handler: logRequest(unix_wifid_router)}
	dhcpdServer := http.Server{Handler: logRequest(unix_dhcpd_router)}
	wireguardServer := http.Server{Handler: logRequest(unix_wireguard_router)}

	headersOk := handlers.AllowedHeaders([]string{"X-Requested-With", "Content-Type", "Authorization", "SPR-Bearer"})
	originsOk := handlers.AllowedOrigins([]string{"*"})
	methodsOk := handlers.AllowedMethods([]string{"GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS"})

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

	// notifications, connect to eventbus
	go NotificationsRunEventListener()

	// updates when enabled
	go checkUpdates()

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

	wireguardServer.Serve(unixWireguardListener)
}
