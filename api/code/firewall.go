package main

import (
  "net/http"
  "os/exec"
  "net"
  "fmt"
  "sync"
  "io/ioutil"
  "encoding/json"
  "log"
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
  IP string
  Port int
  Protocol string
}

type FirewallConfig struct {
  ForwardingRules []ForwardingRule
  BlockSrc  []BlockRule
  BlockDst  []BlockRule
}

var FirewallConfigFile = TEST_PREFIX + "/configs/base/firewall.json"
var gFirewallConfig = FirewallConfig{[]ForwardingRule{}, []BlockRule{}, []BlockRule{}}

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

func applyForwarding(forwarding []ForwardingRule) error {

  //need to flush the fwd rules here

  for _, f := range forwarding {

    cmd := exec.Command("nft", "add", "element", "ip", "nat", f.Protocol + "fwd",
        "{", f.SrcIP, ".", f.SrcPort, ":",
            f.DstIP, ".", f.DstPort, "}" )
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

func applyFirewallRulesLocked() {

  applyForwarding(gFirewallConfig.ForwardingRules)

  applyBlockSrc(gFirewallConfig.BlockSrc)

  applyBlockDst(gFirewallConfig.BlockDst)
}

func initUserFirewallRules() {
  loadFirewallRules()

  FWmtx.Lock()
  defer FWmtx.Unlock()

  applyFirewallRulesLocked()
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

  _, _, err = net.ParseCIDR(fwd.SrcIP)
  if err != nil {
    ip := net.ParseIP(fwd.DstIP)
    if ip == nil {
      http.Error(w, "Invalid SrcIP", 400)
      return
    }
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

func blockIPSrc(w http.ResponseWriter, r *http.Request) {
  FWmtx.Lock()
  defer FWmtx.Unlock()

  br := BlockRule{}
	err := json.NewDecoder(r.Body).Decode(&br)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
  }

  if br.Protocol != "tcp" && br.Protocol != "udp" {
    http.Error(w, err.Error(), 400)
		return
  }

  if br.Port > 65535 {
    http.Error(w, "Invalid port", 400)
    return
  }

  _, _, err = net.ParseCIDR(br.IP)
  if err != nil {
    http.Error(w, "Invalid IP CIDR", 400)
    return
  }


  if r.Method == http.MethodDelete {
    for i := range gFirewallConfig.BlockSrc {
      a := gFirewallConfig.BlockSrc[i]
      if br == a {
        gFirewallConfig.BlockSrc = append(gFirewallConfig.BlockSrc[:i], gFirewallConfig.BlockSrc[i+1:]...)
        return
      }
    }
    http.Error(w, "Not found", 404)
		return
  }

  gFirewallConfig.BlockSrc = append(gFirewallConfig.BlockSrc, br)
  saveFirewallRulesLocked()
  applyFirewallRulesLocked()  
}

func blockIPDst(w http.ResponseWriter, r *http.Request) {
  FWmtx.Lock()
  defer FWmtx.Unlock()

  br := BlockRule{}
	err := json.NewDecoder(r.Body).Decode(&br)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
  }

  if br.Protocol != "tcp" && br.Protocol != "udp" {
    http.Error(w, err.Error(), 400)
		return
  }

  if br.Port > 65535 {
    http.Error(w, "Invalid port", 400)
    return
  }

  _, _, err = net.ParseCIDR(br.IP)
  if err != nil {
    http.Error(w, "Invalid IP CIDR", 400)
    return
  }


  if r.Method == http.MethodDelete {
    for i := range gFirewallConfig.BlockDst {
      a := gFirewallConfig.BlockDst[i]
      if br == a {
        gFirewallConfig.BlockDst = append(gFirewallConfig.BlockDst[:i], gFirewallConfig.BlockDst[i+1:]...)
        return
      }
    }
    http.Error(w, "Not found", 404)
		return
  }

  gFirewallConfig.BlockDst = append(gFirewallConfig.BlockDst, br)
  saveFirewallRulesLocked()
  applyFirewallRulesLocked()
}
