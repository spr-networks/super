package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strings"
)

import (
	"github.com/gorilla/mux"
)

var UNIX_PLUGIN_LISTENER = "/state/api/wireguard_plugin"

//var UNIX_PLUGIN_LISTENER = "./http.sock"

var TEST_PREFIX = ""
var WireguardConfigFile = TEST_PREFIX + "/configs/wireguard/wg0.conf"

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
	PersistentKeepalive uint
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

func getPeers() ([]ClientPeer, error) {
	peers := []ClientPeer{}

	cmd := exec.Command("wg", "show", "wg0", "allowed-ips")
	data, err := cmd.Output()
	if err != nil {
		fmt.Println("wg show failed", err)
		return peers, err
	}

	endpoint, err := getEndpoint()
	if err != nil {
		return peers, err
	}

	for _, line := range strings.Split(string(data), "\n") {
		pieces := strings.Split(line, "\t")
		if len(pieces) < 2 {
			continue
		}

		peer := ClientPeer{}
		peer.PublicKey = pieces[0]
		peer.AllowedIPs = pieces[1]
		peer.Endpoint = endpoint
		peer.PersistentKeepalive = 25

		peers = append(peers, peer)
	}

	return peers, nil
}

// return a new client ip that is not used
func getNewPeerAddress() (string, error) {
	peers, err := getPeers()
	if err != nil {
		return "", err
	}

	ips := map[string]bool{}

	for _, entry := range peers {
		ips[entry.AllowedIPs] = true
	}

	address := ""
	for i := 2; i < 255; i++ {
		ip := fmt.Sprintf("192.168.3.%d/32", i)
		_, exists := ips[ip]
		if !exists {
			address = strings.Replace(ip, "/32", "/24", 1)
			break
		}
	}

	if len(address) == 0 {
		return "", errors.New("could not find a new peer address")
	}

	return address, nil
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

// get wireguard endpoint from the environment
func getEndpoint() (string, error) {
	network, ok := os.LookupEnv("LANIP")
	if !ok {
		return "", errors.New("LANIP not set")
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
	/*pubkey, ok := os.LookupEnv("WIREGUARD_PUBKEY")
	if !ok {
		return "", errors.New("WIREGUARD_PUBKEY not set")
	}*/
	cmd := exec.Command("wg", "show", "wg0", "public-key")
	stdout, err := cmd.Output()
	if err != nil {
		return "", err
	}

	pubkey := strings.TrimSuffix(string(stdout), "\n")

	return pubkey, nil
}

func saveConfig() error {
	cmd := exec.Command("wg-quick", "save", WireguardConfigFile)
	_, err := cmd.Output()
	if err != nil {
		return err
	}

	return nil
}

func removePeer(peer ClientPeer) error {
	cmd := exec.Command("wg", "set", "wg0", "peer", peer.PublicKey, "remove")
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

// return config for a client
func pluginPeer(w http.ResponseWriter, r *http.Request) {
	peer := ClientPeer{}
	err := json.NewDecoder(r.Body).Decode(&peer)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	fmt.Println("peer:", peer)

	if r.Method == http.MethodDelete {
		err = removePeer(peer)
		if err != nil {
			fmt.Println("DELETE peer err:", err)
			http.Error(w, err.Error(), 400)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(true)
		return
	}

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
		address, err := getNewPeerAddress()
		if err != nil {
			fmt.Println("error:", err)
			http.Error(w, "Not found", 404)
			return
		}

		config.Interface.Address = address
	} else {
		//TODO support /24 etc for supplied address
		address := strings.Replace(peer.AllowedIPs, "/32", "", 1)
		ok := true

		peers, _ := getPeers()

		for _, p := range peers {
			ip := strings.Replace(p.AllowedIPs, "/32", "", 1)
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

	//add a new peer
	//wg set wg0 peer <client_pubkey> allowed-ips 10.0.0.x/32
	if len(config.Interface.Address) > 0 {
		AllowedIPs := strings.Replace(config.Interface.Address, "/24", "/32", 1)

		fmt.Println("running:", "wg", "set", "wg0", "peer", peer.PublicKey, "allowed-ips", AllowedIPs)

		cmd := exec.Command("wg", "set", "wg0", "peer", peer.PublicKey, "allowed-ips", AllowedIPs)
		_, err := cmd.Output()
		if err != nil {
			fmt.Println("wg set error:", err)
			http.Error(w, err.Error(), 400)
			return
		}
	}

	err = saveConfig()
	if err != nil {
		fmt.Println("failed to save config:", err)
		http.Error(w, err.Error(), 400)
		return
	}

	// return client config file

	endpoint, err := getEndpoint()
	if err != nil {
		fmt.Println("failed to get endpoint address:", err)
		http.Error(w, "Not found", 404)
		return
	}

	config.Interface.DNS = "1.1.1.1, 1.0.0.1"

	pubkey, err := getPublicKey()
	if err != nil {
		fmt.Println("failed to get server pubkey:", err)
		http.Error(w, "Not found", 404)
		return
	}

	config.Peer.PublicKey = pubkey
	config.Peer.AllowedIPs = "0.0.0.0/0"
	config.Peer.Endpoint = endpoint
	config.Peer.PersistentKeepalive = 25

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

// get already configured clients
func pluginGetPeers(w http.ResponseWriter, r *http.Request) {
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

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		handler.ServeHTTP(w, r)
	})
}

func main() {
	unix_plugin_router := mux.NewRouter().StrictSlash(true)

	unix_plugin_router.HandleFunc("/genkey", pluginGenKey).Methods("GET")
	unix_plugin_router.HandleFunc("/config", pluginGetConfig).Methods("GET")
	unix_plugin_router.HandleFunc("/status", pluginGetStatus).Methods("GET")
	unix_plugin_router.HandleFunc("/peers", pluginGetPeers).Methods("GET")
	unix_plugin_router.HandleFunc("/peer", pluginPeer).Methods("PUT", "DELETE")

	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}

	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

	pluginServer.Serve(unixPluginListener)
}
