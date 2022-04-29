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
  "regexp"
  "strconv"
  "os"
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
  DstIP string
  SrcIP string
  Protocol string
}

type FirewallConfig struct {
  ForwardingRules []ForwardingRule
  BlockRules  []BlockRule
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
  cmd := exec.Command("nft", "add", "element", "inet", "nat", "block", "{",
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
    cmd = exec.Command("nft", "delete", "element", "inet", "nat", f.Protocol + "anyfwd",
        "{", f.SrcIP, ":",
            f.DstIP, "}" )

  } else {
    cmd = exec.Command("nft", "delete", "element", "inet", "nat", f.Protocol + "fwd",
        "{", f.SrcIP, ".", f.SrcPort, ":",
            f.DstIP, ".", f.DstPort, "}" )
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
      cmd = exec.Command("nft", "add", "element", "inet", "nat", f.Protocol + "anyfwd",
          "{", f.SrcIP, ":",
              f.DstIP, "}" )

    } else {
      cmd = exec.Command("nft", "add", "element", "inet", "nat", f.Protocol + "fwd",
          "{", f.SrcIP, ".", f.SrcPort, ":",
              f.DstIP, ".", f.DstPort, "}" )
    }
    _, err := cmd.Output()

    if err != nil {
      fmt.Println("failed to add element", err)
      fmt.Println(cmd)
    }

  }

  return nil
}

func applyBlocking(blockRules [] BlockRule) error {
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

func initUserFirewallRules() {
  loadFirewallRules()

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

  re := regexp.MustCompile("^[0-9\\-]*$")

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
    http.Error(w, err.Error(), 400)
		return
  }

  if CIDRorIP(br.SrcIP) != nil {
    http.Error(w, "Invalid SrcIP", 400)
    return
  }

  if CIDRorIP(br.SrcIP) != nil {
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
