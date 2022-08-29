package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

import (
	"github.com/gorilla/mux"
)

var FWmtx sync.Mutex

type ForwardingRule struct {
	Protocol string
	SrcIP    string
	SrcPort  string
	DstIP    string
	DstPort  string
}

type BlockRule struct {
	DstIP    string
	SrcIP    string
	Protocol string
}

type FirewallConfig struct {
	ForwardingRules []ForwardingRule
	BlockRules      []BlockRule
}

var FirewallConfigFile = TEST_PREFIX + "/configs/base/firewall.json"
var gFirewallConfig = FirewallConfig{[]ForwardingRule{}, []BlockRule{}}

func saveFirewallRulesLocked() {
	file, _ := json.MarshalIndent(gFirewallConfig, "", " ")
	err := ioutil.WriteFile(FirewallConfigFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func loadFirewallRules() error {
	FWmtx.Lock()
	defer FWmtx.Unlock()
	data, err := ioutil.ReadFile(FirewallConfigFile)
	if err != nil {
		return err
	} else {
		err := json.Unmarshal(data, &gFirewallConfig)
		if err != nil {
			return err
		}
	}
	return nil
}

func deleteBlock(br BlockRule) error {
	cmd := exec.Command("nft", "delete", "element", "inet", "nat", "block", "{",
		br.SrcIP, ".", br.DstIP, ".", br.Protocol, ":", "drop", "}")

	_, err := cmd.Output()

	if err != nil {
		fmt.Println("failed to delete element", err)
		fmt.Println(cmd)
	}

	return err
}

func deleteForwarding(f ForwardingRule) error {
	var cmd *exec.Cmd
	if f.SrcPort == "any" {
		cmd = exec.Command("nft", "delete", "element", "inet", "nat", f.Protocol+"anyfwd",
			"{", f.SrcIP, ":",
			f.DstIP, "}")

	} else {
		cmd = exec.Command("nft", "delete", "element", "inet", "nat", f.Protocol+"fwd",
			"{", f.SrcIP, ".", f.SrcPort, ":",
			f.DstIP, ".", f.DstPort, "}")
	}
	_, err := cmd.Output()

	if err != nil {
		fmt.Println("failed to delete element", err)
		fmt.Println(cmd)
	}

	return err

}

func applyForwarding(forwarding []ForwardingRule) error {

	//need to flush the fwd rules here ?

	for _, f := range forwarding {
		var cmd *exec.Cmd
		if f.SrcPort == "any" {
			cmd = exec.Command("nft", "add", "element", "inet", "nat", f.Protocol+"anyfwd",
				"{", f.SrcIP, ":",
				f.DstIP, "}")

		} else {
			cmd = exec.Command("nft", "add", "element", "inet", "nat", f.Protocol+"fwd",
				"{", f.SrcIP, ".", f.SrcPort, ":",
				f.DstIP, ".", f.DstPort, "}")
		}
		_, err := cmd.Output()

		if err != nil {
			fmt.Println("failed to add element", err)
			fmt.Println(cmd)
		}

	}

	return nil
}

func applyBlocking(blockRules []BlockRule) error {
	for _, br := range blockRules {
		cmd := exec.Command("nft", "add", "element", "inet", "nat", "block", "{",
			br.SrcIP, ".", br.DstIP, ".", br.Protocol, ":", "drop", "}")

		_, err := cmd.Output()

		if err != nil {
			fmt.Println("failed to add element", err)
			fmt.Println(cmd)
		}
	}

	return nil
}

func applyFirewallRulesLocked() {

	applyForwarding(gFirewallConfig.ForwardingRules)

	applyBlocking(gFirewallConfig.BlockRules)
}

func applyRadioInterfaces(interfacesConfig []InterfaceConfig) {
	cmd := exec.Command("nft", "flush", "chain", "inet", "filter", "WIPHY_MACSPOOF_CHECK")
	_, err := cmd.Output()
	if err != nil {
		fmt.Println("failed to flush chain", err)
		return
	}

	cmd = exec.Command("nft", "flush", "chain", "inet", "filter", "WIPHY_FORWARD_LAN")
	_, err = cmd.Output()
	if err != nil {
		fmt.Println("failed to flush chain", err)
		return
	}

	for _, entry := range interfacesConfig {
		if entry.Enabled == true && entry.Type == "AP" {
			//#    $(if [ "$VLANSIF" ]; then echo "counter iifname eq "$VLANSIF*" jump DROP_MAC_SPOOF"; fi)
			cmd = exec.Command("nft", "insert", "rule", "inet", "filter", "WIPHY_MACSPOOF_CHECK",
				"counter", "iifname", "eq", entry.Name+".*", "jump", "DROP_MAC_SPOOF")
			_, err = cmd.Output()
			if err != nil {
				fmt.Println("failed to insert rule", cmd, err)
			}

			// $(if [ "$VLANSIF" ]; then echo "counter oifname "$VLANSIF*" ip saddr . iifname vmap @lan_access"; fi)

			cmd = exec.Command("nft", "insert", "rule", "inet", "filter", "WIPHY_FORWARD_LAN",
				"counter", "oifname", entry.Name+".*", "ip", "saddr", ".", "iifname", "vmap", "@lan_access")
			_, err = cmd.Output()
			if err != nil {
				fmt.Println("failed to insert rule", cmd, err)
			}

		}
	}

}

func initUserFirewallRules() {
	loadFirewallRules()

	x := func() {
		FWmtx.Lock()
		defer FWmtx.Unlock()

		applyFirewallRulesLocked()

		//TBD expose upstream_tcp_port_drop nfmap to UI for toggling
		enable_upstream := os.Getenv("UPSTREAM_SERVICES_ENABLE")
		if enable_upstream != "" {
			cmd := exec.Command("nft", "flush", "map", "inet", "filter", "upstream_tcp_port_drop")
			_, err := cmd.Output()

			if err != nil {
				fmt.Println("Failed to disable", err)
				fmt.Println(cmd)
			}
		}

		Interfacesmtx.Lock()
		config := loadInterfacesConfigLocked()
		Interfacesmtx.Unlock()
		applyRadioInterfaces(config)
	}

	// Workaround for docker-compose, which may start api very shortly
	// after base is started, but before the rules are loaded.
	// In the future we may want to formalize this

	//run immediately
	x()

	//and also in 10 seconds
	go func() {
		time.Sleep(10 * time.Second)
		x()
	}()

}

func showNFMap(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	cmd := exec.Command("nft", "-j", "list", "map", "inet", "filter", name)
	stdout, err := cmd.Output()

	if err != nil {
		fmt.Println("show NFMap failed to list", name, "->", err)
		http.Error(w, "Not found", 404)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, string(stdout))
}

func showNFTable(w http.ResponseWriter, r *http.Request) {
	family := mux.Vars(r)["family"]
	name := mux.Vars(r)["name"]

	cmd := exec.Command("nft", "list", "table", family, name)
	stdout, err := cmd.Output()

	if err != nil {
		fmt.Println("show NFMap failed to list ", family, " ", name, "->", err)
		http.Error(w, "Not found", 404)
		return
	}

	w.Header().Set("Content-Type", "plain/text")
	fmt.Fprintf(w, string(stdout))
}

func listNFTables(w http.ResponseWriter, r *http.Request) {
	cmd := exec.Command("nft", "-j", "list", "tables")
	stdout, err := cmd.Output()

	if err != nil {
		fmt.Println("nft failed to list tables", err)
		http.Error(w, "nft failed to list tables", 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, string(stdout))
}

func getFirewallConfig(w http.ResponseWriter, r *http.Request) {
	FWmtx.Lock()
	defer FWmtx.Unlock()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gFirewallConfig)
}

func CIDRorIP(IP string) error {
	_, _, err := net.ParseCIDR(IP)
	if err != nil {
		ip := net.ParseIP(IP)
		if ip == nil {
			return err
		} else {
			return nil
		}
	}
	return err
}

func modifyForwardRules(w http.ResponseWriter, r *http.Request) {
	FWmtx.Lock()
	defer FWmtx.Unlock()

	fwd := ForwardingRule{}
	err := json.NewDecoder(r.Body).Decode(&fwd)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if fwd.Protocol != "tcp" && fwd.Protocol != "udp" {
		http.Error(w, "Invalid protocol", 400)
		return
	}

	re := regexp.MustCompile("^([0-9].*-[0-9].*|[0-9]*)$")

	if fwd.SrcPort != "any" && !re.MatchString(fwd.SrcPort) {
		http.Error(w, "Invalid SrcPort", 400)
		return
	}

	if fwd.DstPort != "any" {
		_, err = strconv.Atoi(fwd.DstPort)
		if err != nil {
			http.Error(w, "Invalid DstPort", 400)
			return
		}
	}

	if CIDRorIP(fwd.SrcIP) != nil {
		http.Error(w, "Invalid SrcIP", 400)
		return
	}

	ip := net.ParseIP(fwd.DstIP)
	if ip == nil {
		http.Error(w, "Invalid DstIP", 400)
		return
	}

	if r.Method == http.MethodDelete {
		for i := range gFirewallConfig.ForwardingRules {
			a := gFirewallConfig.ForwardingRules[i]
			if fwd == a {
				gFirewallConfig.ForwardingRules = append(gFirewallConfig.ForwardingRules[:i], gFirewallConfig.ForwardingRules[i+1:]...)
				saveFirewallRulesLocked()
				deleteForwarding(a)
				return
			}
		}
		http.Error(w, "Not found", 404)
		return
	}

	gFirewallConfig.ForwardingRules = append(gFirewallConfig.ForwardingRules, fwd)
	saveFirewallRulesLocked()
	applyFirewallRulesLocked()
}

func blockIP(w http.ResponseWriter, r *http.Request) {
	FWmtx.Lock()
	defer FWmtx.Unlock()

	br := BlockRule{}
	err := json.NewDecoder(r.Body).Decode(&br)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if br.Protocol != "tcp" && br.Protocol != "udp" {
		http.Error(w, "Invalid protocol", 400)
		return
	}

	if CIDRorIP(br.SrcIP) != nil {
		http.Error(w, "Invalid SrcIP", 400)
		return
	}

	if CIDRorIP(br.DstIP) != nil {
		http.Error(w, "Invalid DstIP", 400)
		return
	}

	if r.Method == http.MethodDelete {
		for i := range gFirewallConfig.BlockRules {
			a := gFirewallConfig.BlockRules[i]
			if br == a {
				gFirewallConfig.BlockRules = append(gFirewallConfig.BlockRules[:i], gFirewallConfig.BlockRules[i+1:]...)
				saveFirewallRulesLocked()
				deleteBlock(a)
				return
			}
		}
		http.Error(w, "Not found", 404)
		return
	}

	gFirewallConfig.BlockRules = append(gFirewallConfig.BlockRules, br)
	saveFirewallRulesLocked()
	applyFirewallRulesLocked()
}

func addVerdict(IP string, Iface string, Table string) {
	err := exec.Command("nft", "add", "element", "inet", "filter", Table, "{", IP, ".", Iface, ":", "accept", "}").Run()
	if err != nil {
		fmt.Println("addVerdict Failed", Iface, Table, err)
		return
	}
}

func addDNSVerdict(IP string, Iface string) {
	addVerdict(IP, Iface, "dns_access")
}

func addLANVerdict(IP string, Iface string) {
	addVerdict(IP, Iface, "lan_access")
}

func addInternetVerdict(IP string, Iface string) {
	addVerdict(IP, Iface, "internet_access")
}

func addCustomVerdict(ZoneName string, IP string, Iface string) {
	//create verdict maps if they do not exist
	err := exec.Command("nft", "list", "map", "inet", "filter", ZoneName+"_dst_access").Run()
	if err != nil {
		//two verdict maps are used for establishing custom groups.
		// the {name}_dst_access map allows Inet packets to a certain IP/interface pair
		//the {name}_src_access part allows Inet packets from a IP/IFace set

		err = exec.Command("nft", "add", "map", "inet", "filter", ZoneName+"_src_access", "{", "type", "ipv4_addr", ".", "ifname", ":", "verdict", ";", "}").Run()
		if err != nil {
			fmt.Println("addCustomVerdict Failed", err)
			return
		}
		err = exec.Command("nft", "add", "map", "inet", "filter", ZoneName+"_dst_access", "{", "type", "ipv4_addr", ".", "ifname", ":", "verdict", ";", "}").Run()
		if err != nil {
			fmt.Println("addCustomVerdict Failed", err)
			return
		}
		err = exec.Command("nft", "insert", "rule", "inet", "filter", "CUSTOM_GROUPS", "ip", "daddr", ".", "oifname", "vmap", "@"+ZoneName+"_dst_access", "ip", "saddr", ".", "iifname", "vmap", "@"+ZoneName+"_src_access").Run()
		if err != nil {
			fmt.Println("addCustomVerdict Failed", err)
			return
		}
	}

	err = exec.Command("nft", "add", "element", "inet", "filter", ZoneName+"_dst_access", "{", IP, ".", Iface, ":", "continue", "}").Run()
	if err != nil {
		fmt.Println("addCustomVerdict Failed", err)
		return
	}

	err = exec.Command("nft", "add", "element", "inet", "filter", ZoneName+"_src_access", "{", IP, ".", Iface, ":", "accept", "}").Run()
	if err != nil {
		fmt.Println("addCustomVerdict Failed", err)
		return
	}
}

func flushVmaps(IP string, MAC string, Ifname string, vmap_names []string, matchInterface bool) {

	for _, name := range vmap_names {
		entries := getNFTVerdictMap(name)
		verdict := getMapVerdict(name)
		for _, entry := range entries {

			//do not flush wireguard entries from vmaps unless the incoming device is on the same interface
			if strings.HasPrefix(Ifname, "wg") {
				if Ifname != entry.ifname {
					continue
				}
			} else if strings.HasPrefix(entry.ifname, "wg") {
				continue
			}

			if (entry.ipv4 == IP) || (matchInterface && (entry.ifname == Ifname)) || (equalMAC(entry.mac, MAC) && (MAC != "")) {
				if entry.mac != "" {
					err := exec.Command("nft", "delete", "element", "inet", "filter", name, "{", entry.ipv4, ".", entry.ifname, ".", entry.mac, ":", verdict, "}").Run()
					if err != nil {
						fmt.Println("nft delete failed", err)
					}
				} else {
					err := exec.Command("nft", "delete", "element", "inet", "filter", name, "{", entry.ipv4, ".", entry.ifname, ":", verdict, "}").Run()
					if err != nil {
						fmt.Println("nft delete failed", err)
						return
					}
				}
			}
		}
	}
}

func addVerdictMac(IP string, MAC string, Iface string, Table string, Verdict string) {
	err := exec.Command("nft", "add", "element", "inet", "filter", Table, "{", IP, ".", Iface, ".", MAC, ":", Verdict, "}").Run()
	if err != nil {
		fmt.Println("addVerdictMac Failed", MAC, Iface, Table, err)
		return
	}
}
