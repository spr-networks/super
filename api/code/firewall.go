package main

import (
  "net/http"
  "os/exec"
  "fmt"
)

import (
  "github.com/gorilla/mux"
)

var FWmtx sync.Mutex

type ForwardingRule struct {
  SIface string
  Protocol string
  SrcIP string
  SrcPort int
  DstIP string
  DstPort string
}

type BlockRule struct {
  IP string
  Port int
  Protocol string
}

type FirewallConfig struct {
  ForwardingRules []ForwardingRule
  BlockSrc  []BlockRule
  BlockDst  []BlockRule
}

var FirewallConfigFile = "/config/base/firewall.json"
var gFirewallConfig = FirewallConfig{}

func loadFirewall() {
  FWmtx.Lock()
  defer FWmtx.Unlock()
  data, err := ioutil.ReadFile(FirewallConfigFile)
	if err != nil {
		fmt.Println("failed to read firewall config file:", err)
	} else {
    err = json.NewDecoder(data).Decode(&gFirewallConfig)
  	if err != nil {
  		http.Error(w, err.Error(), 400)
    }
  }
}

func applyForwarding(forwarding []ForwardingRule) {
  //flush chain
  cmd := exec.Command("nft", "flush", "chain", "inet", "nat", "FORWARDING_RULES")
	_, err := cmd.Output()

  //inet_service : ipv4_addr
  // dnat ip to tcp dport map @mymap
  
  for f := range forwarding {
    //iifname $WANIF tcp dport 2456 dnat ip to 192.168.2.142
    //if SrcIP is null assume port forwarding from $WANIF
    "iifname", f.SIface, f.Protocol, "dport", s.DstPort, "dnat", "ip", "to", s.DstIP

  }

  type ForwardingRule struct {
    Protocol string
    SrcIP string
    SrcPort int
    DstIP string
    DstPort string
  }
}

func applyFirewall() {
  FWmtx.Lock()
  defer FWmtx.Unlock()

  applyForwarding(gFirewallConfig.ForwardingRules)

  applyBlockSrc(gFirewallConfig.BlockSrc)

  applyBlockDst(gFirewallConfig.BlockDst)

}
func initUserFirewallRules() {
  loadFirewall()
  applyFirewall()
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
		fmt.Println("nft failed to list tables",  err)
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

func modifyForwardRules(w http.ResponseWriter, r *http.Request) {
  FWmtx.Lock()
  defer FWmtx.Unlock()
}

func blockIPSrc(w http.ResponseWriter, r *http.Request) {
  FWmtx.Lock()
  defer FWmtx.Unlock()
}

func blockIPDst(w http.ResponseWriter, r *http.Request) {
  FWmtx.Lock()
  defer FWmtx.Unlock()
}
