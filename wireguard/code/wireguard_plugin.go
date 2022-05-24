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
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
)

import (
	"github.com/gorilla/mux"
)

var UNIX_PLUGIN_LISTENER = "/state/plugins/wireguard/wireguard_plugin"

var TEST_PREFIX = ""
var WireguardInterface = "wg0"
var WireguardConfigFile = TEST_PREFIX + "/configs/wireguard/wg0.conf"

var Configmtx sync.Mutex

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

	cmd := exec.Command("wg", "genkey")
	stdout, err := cmd.Output()
	if err != nil {
		fmt.Println("wg genkey failed", err)
		return keypair, err
	}

	keypair.PrivateKey = strings.TrimSuffix(string(stdout), "\n")

	cmd = exec.Command("wg", "pubkey")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		fmt.Println("wg pubkey failed", err)
		return keypair, err
	}

	go func() {
		defer stdin.Close()
		io.WriteString(stdin, keypair.PrivateKey+"\n")
	}()

	pubkey, err := cmd.Output()
	if err != nil {
		fmt.Println("wg pubkey failed: bad key", err)
		return keypair, err
	}

	keypair.PublicKey = strings.TrimSuffix(string(pubkey), "\n")

	return keypair, nil
}

func genPresharedKey() (string, error) {
	cmd := exec.Command("wg", "genpsk")
	stdout, err := cmd.Output()
	if err != nil {
		fmt.Println("wg genpsk failed", err)
		return "", err
	}

	PresharedKey := strings.TrimSuffix(string(stdout), "\n")
	return PresharedKey, nil
}

func getPeers() ([]ClientPeer, error) {
	peers := []ClientPeer{}

	cmd := exec.Command("wg", "show", WireguardInterface, "dump")
	data, err := cmd.Output()
	if err != nil {
		fmt.Println("wg show failed", err)
		return peers, err
	}

	for idx, line := range strings.Split(string(data), "\n") {
		// interface config - TODO get listenPort from here
		//private_key public_key listen_port fwmark
		if idx == 0 {
			continue
		}

		pieces := strings.Split(line, "\t")
		// 4 for interface
		if len(pieces) < 8 {
			continue
		}

		//public_key preshared_key endpoint allowed_ips latest_handshake transfer_rx transfer_tx persistent_keepalive
		peer := ClientPeer{}
		peer.PublicKey = pieces[0]
		peer.PresharedKey = pieces[1]
		peer.Endpoint = pieces[2]
		peer.AllowedIPs = pieces[3]
		peer.LatestHandshake, _ = strconv.ParseUint(pieces[4], 10, 64)
		peer.TransferRx, _ = strconv.ParseUint(pieces[5], 10, 64)
		peer.TransferTx, _ = strconv.ParseUint(pieces[6], 10, 64)
		peer.PersistentKeepalive, _ = strconv.ParseUint(pieces[7], 10, 64)

		peers = append(peers, peer)
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
		return "", errors.New(fmt.Sprintf("interface %s don't have an ipv4 address\n", iname))
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

// get wireguard endpoint from the environment
func getPublicKey() (string, error) {
	cmd := exec.Command("wg", "show", WireguardInterface, "public-key")
	stdout, err := cmd.Output()
	if err != nil {
		return "", err
	}

	pubkey := strings.TrimSuffix(string(stdout), "\n")

	return pubkey, nil
}

func saveConfig() error {
	cmd := exec.Command("wg", "showconf", WireguardInterface)
	data, err := cmd.Output()
	if err != nil {
		return err
	}

	err = ioutil.WriteFile(WireguardConfigFile, data, 0600)
	if err != nil {
		return err
	}

	return nil
}

func removePeer(peer ClientPeer) error {
	cmd := exec.Command("wg", "set", WireguardInterface, "peer", peer.PublicKey, "remove")
	_, err := cmd.Output()
	if err != nil {
		return err
	}

	err = saveConfig()
	if err != nil {
		return err
	}

	return nil
}

type AbstractDHCPRequest struct {
	Identifier string
}

var tinysubnets_plugin_path = "/state/dhcp/tinysubnets_plugin"
var api_path = "/state/plugins/wireguard/apisock"

type Record struct {
	IP       net.IP
	RouterIP net.IP
}

func getNewPeerAddress(PublicKey string) (string, error) {
	//call into the tinysubnets DHCP plugin
	c := http.Client{}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", tinysubnets_plugin_path)
		},
	}

	requestJson, _ := json.Marshal(AbstractDHCPRequest{Identifier: PublicKey})

	req, err := http.NewRequest(http.MethodPut, "http://dhcp/DHCPRequest", bytes.NewBuffer(requestJson))
	if err != nil {
		return "", err
	}

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println(err.Error())
		return "", err
	}

	rec := Record{}
	_ = json.NewDecoder(resp.Body).Decode(&rec)

	if rec.IP.String() != "" {
		return rec.IP.String(), nil
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

	cmd := exec.Command("wg", "set", WireguardInterface, "peer", peer.PublicKey, "preshared-key", "/dev/stdin", "allowed-ips", AllowedIPs)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		fmt.Println("wg set stdin pipe error:", err)
		http.Error(w, err.Error(), 400)
		return
	}

	go func() {
		defer stdin.Close()
		io.WriteString(stdin, PresharedKey+"\n")
	}()

	_, err = cmd.Output()
	if err != nil {
		fmt.Println("wg set stdout error:", err)
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

	// Point DNS to CoreDNS/DNSIP setting
	dns, ok := os.LookupEnv("DNSIP")
	if ok {
		config.Interface.DNS = dns
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

// TODO parse output from wg show wg0 dump && strip PrivateKey
func pluginGetStatus(w http.ResponseWriter, r *http.Request) {
	Configmtx.Lock()
	defer Configmtx.Unlock()

	cmd := exec.Command("/scripts/wg-json")
	data, err := cmd.Output()
	if err != nil {
		fmt.Println("wg-json failed", err)
		http.Error(w, "Not found", 404)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprint(w, string(data))
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

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
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

func main() {
	unix_plugin_router := mux.NewRouter().StrictSlash(true)

	unix_plugin_router.HandleFunc("/genkey", pluginGenKey).Methods("GET")
	unix_plugin_router.HandleFunc("/config", pluginGetConfig).Methods("GET")
	unix_plugin_router.HandleFunc("/status", pluginGetStatus).Methods("GET")
	unix_plugin_router.HandleFunc("/peers", pluginGetPeers).Methods("GET")
	unix_plugin_router.HandleFunc("/peer", pluginPeer).Methods("PUT", "DELETE")

	unix_plugin_router.HandleFunc("/up", pluginUp).Methods("PUT")
	unix_plugin_router.HandleFunc("/down", pluginDown).Methods("PUT")

	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}

	informPeersToApi()

	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

	pluginServer.Serve(unixPluginListener)
}
