package main

import (
  "net/http"
  "os/exec"
  "fmt"
  "sync"
  "io/ioutil"
  "encoding/json"
  "strconv"
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
  DstPort int
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

func applyForwarding(forwarding []ForwardingRule) error {

  //need to flush the fwd rules here

  for _, f := range forwarding {


    cmd := exec.Command("nft", "add", "element", "ip", "nat", f.Protocol + "fwd",
        "{", f.SIface, ".", f.SrcIP, ".", strconv.Itoa(f.SrcPort), ":",
            f.DstIP, ".", strconv.Itoa(f.DstPort), "}" )
    _, err := cmd.Output()


    if err != nil {
      fmt.Println("failed to add element", err)
      return err
    }

  }

  return nil
}

func applyBlockSrc([] BlockRule) {

}

func applyBlockDst([] BlockRule) {

}

func applyFirewallRules() {
  FWmtx.Lock()
  defer FWmtx.Unlock()

  applyForwarding(gFirewallConfig.ForwardingRules)

  applyBlockSrc(gFirewallConfig.BlockSrc)

  applyBlockDst(gFirewallConfig.BlockDst)

}
func initUserFirewallRules() {
  loadFirewallRules()
  applyFirewallRules()
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
