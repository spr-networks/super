package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
)

import (
	"github.com/gorilla/mux"
	"golang.zx2c4.com/wireguard/wgctrl"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"
)

var UNIX_PLUGIN_LISTENER = TEST_PREFIX + "/state/plugins/wireguard/wireguard_plugin"

var TEST_PREFIX = ""
var WireguardInterface = "wg0"
var WireguardConfigFile = TEST_PREFIX + "/configs/wireguard/wg0.conf"
var DNSIPPath = TEST_PREFIX + "/configs/base/lanip"
var WireguardSPRConfigFile = TEST_PREFIX + "/configs/wireguard/wg.json"
var ApiConfigPath = TEST_PREFIX + "/configs/base/api.json"

var Configmtx sync.Mutex

type SPRConfig struct {
	Endpoints []string
}

type KeyPair struct {
	PrivateKey string
	PublicKey  string
}

type ClientInterface struct {
	PrivateKey string
	Address    string
	DNS        string
}

type ClientPeer struct {
	PublicKey           string
	AllowedIPs          string
	Endpoint            string
	PresharedKey        string
	PersistentKeepalive uint64
	LatestHandshake     uint64
	TransferRx          uint64
	TransferTx          uint64
}

type ClientConfig struct {
	Interface ClientInterface
	Peer      ClientPeer
}

// generate a new keypair for a client
func genKeyPair() (KeyPair, error) {
	keypair := KeyPair{}

	privateKey, err := wgtypes.GeneratePrivateKey()
	if err != nil {
		fmt.Println("wg genkey failed", err)
		return keypair, err
	}

	keypair.PrivateKey = privateKey.String()
	keypair.PublicKey = privateKey.PublicKey().String()

	return keypair, nil
}

func genPresharedKey() (string, error) {
	key, err := wgtypes.GenerateKey()
	if err != nil {
		fmt.Println("wg genpsk failed", err)
		return "", err
	}

	return key.String(), nil
}

// clientPeerFromDevice maps a wgtypes.Peer to the ClientPeer wire format,
// preserving the conventions of the previous `wg show <iface> dump` parser:
// unset preshared key and endpoint are "(none)", empty allowed-ips is
// "(none)", allowed-ips are comma-joined, keepalive off is 0.
func clientPeerFromDevice(p wgtypes.Peer) ClientPeer {
	peer := ClientPeer{}
	peer.PublicKey = p.PublicKey.String()

	if p.PresharedKey == (wgtypes.Key{}) {
		peer.PresharedKey = "(none)"
	} else {
		peer.PresharedKey = p.PresharedKey.String()
	}

	if p.Endpoint == nil {
		peer.Endpoint = "(none)"
	} else {
		peer.Endpoint = p.Endpoint.String()
	}

	if len(p.AllowedIPs) == 0 {
		peer.AllowedIPs = "(none)"
	} else {
		ips := []string{}
		for _, ipnet := range p.AllowedIPs {
			ips = append(ips, ipnet.String())
		}
		peer.AllowedIPs = strings.Join(ips, ",")
	}

	if !p.LastHandshakeTime.IsZero() {
		peer.LatestHandshake = uint64(p.LastHandshakeTime.Unix())
	}
	peer.TransferRx = uint64(p.ReceiveBytes)
	peer.TransferTx = uint64(p.TransmitBytes)
	peer.PersistentKeepalive = uint64(p.PersistentKeepaliveInterval.Seconds())

	return peer
}

func getPeers() ([]ClientPeer, error) {
	peers := []ClientPeer{}

	c, err := wgctrl.New()
	if err != nil {
		fmt.Println("wgctrl failed", err)
		return peers, err
	}
	defer c.Close()

	dev, err := c.Device(WireguardInterface)
	if err != nil {
		fmt.Println("wg show failed", err)
		return peers, err
	}

	for _, p := range dev.Peers {
		peers = append(peers, clientPeerFromDevice(p))
	}

	return peers, nil
}

func pluginGenKey(w http.ResponseWriter, r *http.Request) {
	keypair, err := genKeyPair()
	if err != nil {
		fmt.Println("wg key failed")
		http.Error(w, "Not found", 404)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(keypair)
}

func getNetworkIP() (string, error) {
	iname, ok := os.LookupEnv("WANIF")
	if !ok {
		return "", errors.New("WANIF not set")
	}

	ief, err := net.InterfaceByName(iname)
	if err != nil {
		return "", err
	}
	addrs, err := ief.Addrs()
	if err != nil {
		return "", err
	}
	if len(addrs) > 0 {
		return addrs[0].(*net.IPNet).IP.String(), nil
	} else {
		return "", errors.New(fmt.Sprintf("interface %s doesn't have an ipv4 address\n", iname))
	}
}

// get wireguard endpoint from the upstream interface
func getEndpoint() (string, error) {

	network, err := getNetworkIP()

	if err != nil {
		fmt.Println(err)
		return "", err
	}

	port, ok := os.LookupEnv("WIREGUARD_PORT")
	if !ok {
		port = "51280"
	}

	endpoint := fmt.Sprintf("%s:%s", network, port)
	return endpoint, nil
}

// get the server public key from the wireguard interface
func getPublicKey() (string, error) {
	c, err := wgctrl.New()
	if err != nil {
		return "", err
	}
	defer c.Close()

	dev, err := c.Device(WireguardInterface)
	if err != nil {
		return "", err
	}

	// `wg show <iface> public-key` prints "(none)" when no key is set
	if dev.PublicKey == (wgtypes.Key{}) {
		return "(none)", nil
	}

	return dev.PublicKey.String(), nil
}

// buildWireguardConfig renders a device in the exact format of
// `wg showconf <iface>`. The format is load-bearing: up.sh re-applies the
// saved file with `wg setconf`.
func buildWireguardConfig(dev *wgtypes.Device) string {
	var b strings.Builder

	b.WriteString("[Interface]\n")
	if dev.ListenPort != 0 {
		fmt.Fprintf(&b, "ListenPort = %d\n", dev.ListenPort)
	}
	if dev.FirewallMark != 0 {
		fmt.Fprintf(&b, "FwMark = 0x%x\n", dev.FirewallMark)
	}
	if dev.PrivateKey != (wgtypes.Key{}) {
		fmt.Fprintf(&b, "PrivateKey = %s\n", dev.PrivateKey.String())
	}
	b.WriteString("\n")

	for i, p := range dev.Peers {
		fmt.Fprintf(&b, "[Peer]\nPublicKey = %s\n", p.PublicKey.String())
		if p.PresharedKey != (wgtypes.Key{}) {
			fmt.Fprintf(&b, "PresharedKey = %s\n", p.PresharedKey.String())
		}
		if len(p.AllowedIPs) > 0 {
			b.WriteString("AllowedIPs = ")
			for j, ipnet := range p.AllowedIPs {
				if j > 0 {
					b.WriteString(", ")
				}
				b.WriteString(ipnet.String())
			}
			b.WriteString("\n")
		}
		if p.Endpoint != nil {
			fmt.Fprintf(&b, "Endpoint = %s\n", p.Endpoint.String())
		}
		if p.PersistentKeepaliveInterval != 0 {
			fmt.Fprintf(&b, "PersistentKeepalive = %d\n", int(p.PersistentKeepaliveInterval.Seconds()))
		}
		if i < len(dev.Peers)-1 {
			b.WriteString("\n")
		}
	}

	return b.String()
}

func saveConfig() error {
	c, err := wgctrl.New()
	if err != nil {
		return err
	}
	defer c.Close()

	dev, err := c.Device(WireguardInterface)
	if err != nil {
		return err
	}

	data := buildWireguardConfig(dev)

	err = ioutil.WriteFile(WireguardConfigFile, []byte(data), 0600)
	if err != nil {
		return err
	}

	return nil
}

func removePeer(peer ClientPeer) error {
	publicKey, err := wgtypes.ParseKey(peer.PublicKey)
	if err != nil {
		return err
	}

	c, err := wgctrl.New()
	if err != nil {
		return err
	}
	defer c.Close()

	err = c.ConfigureDevice(WireguardInterface, wgtypes.Config{
		Peers: []wgtypes.PeerConfig{{PublicKey: publicKey, Remove: true}},
	})
	if err != nil {
		return err
	}

	err = saveConfig()
	if err != nil {
		return err
	}

	return nil
}

// parseAllowedIPs accepts the wg CLI's allowed-ips syntax: comma-separated
// entries, each an IP/cidr or a bare IP (implied /32 or /128).
func parseAllowedIPs(allowedIPs string) ([]net.IPNet, error) {
	nets := []net.IPNet{}
	for _, cidr := range strings.Split(allowedIPs, ",") {
		entry := strings.TrimSpace(cidr)
		_, ipnet, err := net.ParseCIDR(entry)
		if err != nil {
			ip := net.ParseIP(entry)
			if ip == nil {
				return nil, fmt.Errorf("invalid allowed-ips %s: %v", entry, err)
			}
			bits := 128
			if ip4 := ip.To4(); ip4 != nil {
				bits = 32
				ip = ip4
			}
			ipnet = &net.IPNet{IP: ip, Mask: net.CIDRMask(bits, bits)}
		}
		nets = append(nets, *ipnet)
	}
	return nets, nil
}

// addPeer configures a peer on the interface, replicating
// `wg set <iface> peer <pk> preshared-key <psk> allowed-ips <ips>`
// (allowed-ips on the wg CLI replaces the existing list).
func addPeer(publicKey, presharedKey, allowedIPs string) error {
	pk, err := wgtypes.ParseKey(publicKey)
	if err != nil {
		return fmt.Errorf("invalid public key: %v", err)
	}

	psk, err := wgtypes.ParseKey(presharedKey)
	if err != nil {
		return fmt.Errorf("invalid preshared key: %v", err)
	}

	nets, err := parseAllowedIPs(allowedIPs)
	if err != nil {
		return err
	}

	c, err := wgctrl.New()
	if err != nil {
		return err
	}
	defer c.Close()

	return c.ConfigureDevice(WireguardInterface, wgtypes.Config{
		Peers: []wgtypes.PeerConfig{{
			PublicKey:         pk,
			PresharedKey:      &psk,
			ReplaceAllowedIPs: true,
			AllowedIPs:        nets,
		}},
	})
}

type AbstractDHCPRequest struct {
	Identifier string
}

var dhcp_path = TEST_PREFIX + "/state/dhcp/apisock"
var api_path = "/state/plugins/wireguard/apisock"

type DHCPResponse struct {
	IP        string
	RouterIP  string
	DNSIP     string
	LeaseTime string
}

func getNewPeerAddress(PublicKey string) (string, error) {
	//call into the tinysubnets DHCP plugin
	c := http.Client{}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", dhcp_path)
		},
	}

	requestJson, _ := json.Marshal(AbstractDHCPRequest{Identifier: PublicKey})

	req, err := http.NewRequest(http.MethodPut, "http://dhcp/abstractDhcpRequest", bytes.NewBuffer(requestJson))
	if err != nil {
		return "", err
	}

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println(err.Error())
		return "", err
	}

	dhcpResponse := DHCPResponse{}
	_ = json.NewDecoder(resp.Body).Decode(&dhcpResponse)

	if dhcpResponse.IP != "" {
		return dhcpResponse.IP, nil
	}

	return "", errors.New("Failed to receive IP")
}

type WireguardUpdate struct {
	IP        string
	PublicKey string
	Iface     string
	Name      string
}

func updateWireguardAddress(update WireguardUpdate, doRemove bool) error {
	//call into the API to update the WireGuard Info
	c := http.Client{}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", api_path)
		},
	}

	requestJson, _ := json.Marshal(update)

	methodType := http.MethodPut
	if doRemove {
		methodType = http.MethodDelete
	}

	req, err := http.NewRequest(methodType, "http://api-wireguard/wireguardUpdate", bytes.NewBuffer(requestJson))
	if err != nil {
		fmt.Println(err.Error())
		return err
	}

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println(err.Error())
		return err
	}

	if resp.StatusCode == 200 {
		return nil
	}

	fmt.Println("wireguard-api error", resp.Status)

	return errors.New("Failed to update API: " + resp.Status)

}

// return config for a client
func pluginPeer(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	peer := ClientPeer{}
	err := json.NewDecoder(r.Body).Decode(&peer)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if r.Method == http.MethodDelete {
		peerIP := ""
		//get the IP assigned to this public key
		peers, _ := getPeers()
		for _, p := range peers {
			if p.PublicKey == peer.PublicKey {
				peerIP = strings.Split(p.AllowedIPs, "/")[0]
				break
			}
		}

		err = removePeer(peer)
		if err != nil {
			fmt.Println("DELETE peer err:", err)
			http.Error(w, err.Error(), 400)
			return
		}

		//delete wireguard key
		updateWireguardAddress(WireguardUpdate{IP: peerIP,
			PublicKey: peer.PublicKey,
			Iface:     WireguardInterface}, true)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(true)
		return
	}

	// this is whats returned
	config := ClientConfig{}

	if len(peer.PublicKey) == 0 {
		keypair, err := genKeyPair()
		if err != nil {
			fmt.Println("wg key failed")
			http.Error(w, "Not found", 404)
			return
		}

		config.Interface.PrivateKey = keypair.PrivateKey
		peer.PublicKey = keypair.PublicKey
	} else {
		config.Interface.PrivateKey = "<PRIVATE KEY>"
	}

	if len(peer.AllowedIPs) == 0 {
		address, err := getNewPeerAddress(peer.PublicKey)
		if err != nil {
			fmt.Println("error:", err)
			http.Error(w, "Not found", 404)
			return
		}

		config.Interface.Address = address
	} else {
		address := peer.AllowedIPs
		ok := true

		peers, _ := getPeers()

		for _, p := range peers {
			ip := p.AllowedIPs
			if ip == address {
				ok = false
				break
			}
		}

		if !ok {
			fmt.Println("error: address already set")
			http.Error(w, "address already set", 400)
			return
		}

		config.Interface.Address = peer.AllowedIPs
	}

	// TODO verify pubkey

	//add a new peer with multicast support
	AllowedIPs := config.Interface.Address + ",224.0.0.0/4"

	PresharedKey, err := genPresharedKey()
	if err != nil {
		fmt.Println("genpsk fail:", err)
		return
	}

	err = addPeer(peer.PublicKey, PresharedKey, AllowedIPs)
	if err != nil {
		fmt.Println("wg set error:", err)
		http.Error(w, err.Error(), 400)
		return
	}

	// save config
	err = saveConfig()
	if err != nil {
		fmt.Println("failed to save config:", err)
		http.Error(w, err.Error(), 400)
		return
	}

	// return client config file

	// user can specify endpoint
	if len(peer.Endpoint) == 0 {
		endpoint, err := getEndpoint()
		if err != nil {
			fmt.Println("failed to get endpoint address:", err)
			http.Error(w, "Not found", 404)
			return
		}

		peer.Endpoint = endpoint
	}

	config.Interface.DNS = "1.1.1.1, 1.0.0.1"

	dnsb, err := ioutil.ReadFile(DNSIPPath)
	if err != nil {
		//TBD this should be be pulled from the API
		// Point DNS to CoreDNS/DNSIP setting
		dns, ok := os.LookupEnv("DNSIP")
		if ok {
			config.Interface.DNS = dns
		}
	} else if len(dnsb) != 0 {
		config.Interface.DNS = string(dnsb)
	}

	PublicKey, err := getPublicKey()
	if err != nil {
		fmt.Println("failed to get server pubkey:", err)
		http.Error(w, "Not found", 404)
		return
	}

	config.Peer.PublicKey = PublicKey
	config.Peer.PresharedKey = PresharedKey
	//route * to wireguard
	config.Peer.AllowedIPs = "0.0.0.0/0, ::/0"
	config.Peer.Endpoint = peer.Endpoint
	config.Peer.PersistentKeepalive = 25

	//inform the API

	IP := strings.Split(config.Interface.Address, "/")[0]
	updateWireguardAddress(WireguardUpdate{IP: IP,
		PublicKey: peer.PublicKey,
		Iface:     WireguardInterface}, false)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// get already configured clients
func pluginGetPeers(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	peers, err := getPeers()
	if err != nil {
		fmt.Println("error:", err)
		http.Error(w, "Not found", 404)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(peers)
}

func pluginGetConfig(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()
	data, err := ioutil.ReadFile(WireguardConfigFile)
	if err != nil {
		fmt.Println("failed to read config file:", err)
		http.Error(w, "Not found", 404)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(string(data))
}

// wgStatusPeer / wgStatusDevice replicate the JSON emitted by the wg-json
// script from wireguard-tools (which the API's /status consumers parse):
// fields are omitted when unset and the private key is never included.
type wgStatusPeer struct {
	PresharedKey        string   `json:"presharedKey,omitempty"`
	Endpoint            string   `json:"endpoint,omitempty"`
	LatestHandshake     int64    `json:"latestHandshake,omitempty"`
	TransferRx          int64    `json:"transferRx,omitempty"`
	TransferTx          int64    `json:"transferTx,omitempty"`
	PersistentKeepalive int      `json:"persistentKeepalive,omitempty"`
	AllowedIPs          []string `json:"allowedIps"`
}

type wgStatusDevice struct {
	PublicKey  string                  `json:"publicKey,omitempty"`
	ListenPort int                     `json:"listenPort,omitempty"`
	Fwmark     int                     `json:"fwmark,omitempty"`
	Peers      map[string]wgStatusPeer `json:"peers"`
}

func getStatus() (map[string]wgStatusDevice, error) {
	c, err := wgctrl.New()
	if err != nil {
		return nil, err
	}
	defer c.Close()

	devices, err := c.Devices()
	if err != nil {
		return nil, err
	}

	status := map[string]wgStatusDevice{}
	for _, dev := range devices {
		entry := wgStatusDevice{
			ListenPort: dev.ListenPort,
			Fwmark:     dev.FirewallMark,
			Peers:      map[string]wgStatusPeer{},
		}
		if dev.PublicKey != (wgtypes.Key{}) {
			entry.PublicKey = dev.PublicKey.String()
		}

		for _, p := range dev.Peers {
			peer := wgStatusPeer{
				TransferRx:          p.ReceiveBytes,
				TransferTx:          p.TransmitBytes,
				PersistentKeepalive: int(p.PersistentKeepaliveInterval.Seconds()),
				AllowedIPs:          []string{},
			}
			if p.PresharedKey != (wgtypes.Key{}) {
				peer.PresharedKey = p.PresharedKey.String()
			}
			if p.Endpoint != nil {
				peer.Endpoint = p.Endpoint.String()
			}
			if !p.LastHandshakeTime.IsZero() {
				peer.LatestHandshake = p.LastHandshakeTime.Unix()
			}
			for _, ipnet := range p.AllowedIPs {
				peer.AllowedIPs = append(peer.AllowedIPs, ipnet.String())
			}
			entry.Peers[p.PublicKey.String()] = peer
		}

		status[dev.Name] = entry
	}

	return status, nil
}

func pluginGetStatus(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	status, err := getStatus()
	if err != nil {
		fmt.Println("wg status failed", err)
		http.Error(w, "Not found", 404)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func pluginUp(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	cmd := exec.Command("/scripts/up.sh")
	_, err := cmd.Output()
	if err != nil {
		fmt.Println("wg up failed", err)
		http.Error(w, "wg up error", 400)
		return
	}

	informPeersToApi()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(true)
}

func pluginDown(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	cmd := exec.Command("/scripts/down.sh")
	_, err := cmd.Output()
	if err != nil {
		fmt.Println("wg down failed", err)
		http.Error(w, "wg down error", 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(true)
}

func loadSprConfig() SPRConfig {
	spr := SPRConfig{}

	data, err := ioutil.ReadFile(WireguardSPRConfigFile)
	if err != nil {
		fmt.Println(err)
	} else {
		err = json.Unmarshal(data, &spr)
		if err != nil {
			fmt.Println(err)
		}
	}

	return spr
}

func saveSprConfig(config SPRConfig) {
	file, _ := json.MarshalIndent(config, "", " ")
	err := ioutil.WriteFile(WireguardSPRConfigFile, file, 0600)
	if err != nil {
		fmt.Println(err)
	}
}

func getSetEndpoints(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	//load the SPR Config
	spr := loadSprConfig()

	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(spr.Endpoints)
		return
	}

	endpoints := []string{}
	err := json.NewDecoder(r.Body).Decode(&endpoints)

	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	spr.Endpoints = endpoints
	saveSprConfig(spr)
}

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("DEBUGHTTP") != "" {
			fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		}
		handler.ServeHTTP(w, r)
	})
}

func informPeersToApi() {
	//inform the API about each configured peer to keep verdict maps for zones
	//up to date
	peers, _ := getPeers()
	for _, p := range peers {
		IP := strings.Split(p.AllowedIPs, "/")[0]
		updateWireguardAddress(WireguardUpdate{IP: IP,
			PublicKey: p.PublicKey,
			Iface:     WireguardInterface}, false)
	}

}

func wireguardEnabledInConfig() bool {
	data, err := ioutil.ReadFile(ApiConfigPath)
	if err != nil {
		return true
	}

	cfg := struct {
		Plugins []struct {
			Name    string
			Enabled bool
		}
	}{}

	if err := json.Unmarshal(data, &cfg); err != nil {
		return true
	}

	for _, p := range cfg.Plugins {
		if p.Name == "wireguard" {
			return p.Enabled
		}
	}

	return true
}

func main() {
	if wireguardEnabledInConfig() {
		if _, err := exec.Command("/scripts/up.sh").Output(); err != nil {
			fmt.Println("wg up failed at startup", err)
		}
	}

	unix_plugin_router := mux.NewRouter().StrictSlash(true)

	unix_plugin_router.HandleFunc("/genkey", pluginGenKey).Methods("GET")
	unix_plugin_router.HandleFunc("/config", pluginGetConfig).Methods("GET")
	unix_plugin_router.HandleFunc("/status", pluginGetStatus).Methods("GET")
	unix_plugin_router.HandleFunc("/peers", pluginGetPeers).Methods("GET")
	unix_plugin_router.HandleFunc("/peer", pluginPeer).Methods("PUT", "DELETE")

	unix_plugin_router.HandleFunc("/up", pluginUp).Methods("PUT")
	unix_plugin_router.HandleFunc("/down", pluginDown).Methods("PUT")

	unix_plugin_router.HandleFunc("/endpoints", getSetEndpoints).Methods("GET", "PUT")

	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}

	informPeersToApi()

	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

	pluginServer.Serve(unixPluginListener)
}
