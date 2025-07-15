package main

import (
	"encoding/json"
	"fmt"
	"golang.org/x/sys/unix"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"os/exec"
	"reflect"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

import (
	"github.com/gorilla/mux"
	"github.com/vishvananda/netlink"
)

var FWmtx sync.Mutex

type BaseRule struct {
	RuleName string
	Disabled bool
}

type ForwardingRule struct {
	BaseRule
	Protocol string
	DstIP    string
	DstPort  string
	SrcIP    string
	SrcPort  string
}

type BlockRule struct {
	BaseRule
	Protocol string
	DstIP    string
	SrcIP    string
}

type ForwardingBlockRule struct {
	BaseRule
	Protocol string
	DstIP    string
	DstPort  string
	SrcIP    string
}

type OutputBlockRule struct {
	BaseRule
	Protocol string
	DstIP    string
	DstPort  string
	SrcIP    string
}

type CustomInterfaceRule struct {
	BaseRule
	Interface string
	SrcIP     string
	RouteDst  string
	Policies  []string
	Groups    []string
	Tags      []string //unused for now
}

func (c *CustomInterfaceRule) Equals(other *CustomInterfaceRule) bool {
	// Create copies of the Groups and Tags so that the original slices are not modified
	cGroups := make([]string, len(c.Groups))
	copy(cGroups, c.Groups)
	cTags := make([]string, len(c.Tags))
	copy(cTags, c.Tags)

	otherGroups := make([]string, len(other.Groups))
	copy(otherGroups, other.Groups)
	otherTags := make([]string, len(other.Tags))
	copy(otherTags, other.Tags)

	// Sort the copies of Groups and Tags
	sort.Strings(cGroups)
	sort.Strings(cTags)
	sort.Strings(otherGroups)
	sort.Strings(otherTags)

	// Create a copy of CustomInterfaceRule to compare the sorted slices
	cCopy := *c
	otherCopy := *other
	cCopy.Groups = cGroups
	cCopy.Tags = cTags
	otherCopy.Groups = otherGroups
	otherCopy.Tags = otherTags

	return reflect.DeepEqual(cCopy, otherCopy)
}

type ServicePort struct {
	Protocol        string
	Port            string
	UpstreamEnabled bool
}

// an endpoint describes an arbitrary service. It serves
// as a helper for creating other firewall rules,
// as well as one-way connectivity from devices to the endpoint
// when they share a tag.
type Endpoint struct {
	BaseRule
	Protocol string
	IP       string
	Domain   string
	Port     string
	Tags     []string
}

// NOTE , we do not need an address to filter with as well,
// the multicast proxy will take care of that.
type MulticastPort struct {
	Port     string //udp port number to listen on
	Upstream bool   // if enabled will advertose both on uplink and lan interfaces
}

type FirewallConfig struct {
	ForwardingRules      []ForwardingRule
	BlockRules           []BlockRule
	OutputBlockRules     []OutputBlockRule
	ForwardingBlockRules []ForwardingBlockRule
	CustomInterfaceRules []CustomInterfaceRule
	ServicePorts         []ServicePort
	Endpoints            []Endpoint
	MulticastPorts       []MulticastPort
	PingLan              bool
	PingWan              bool
	SystemDNSOverride    string
}

var FirewallConfigFile = TEST_PREFIX + "/configs/base/firewall.json"
var gFirewallConfig = FirewallConfig{[]ForwardingRule{}, []BlockRule{}, []OutputBlockRule{},
	[]ForwardingBlockRule{}, []CustomInterfaceRule{}, []ServicePort{},
	[]Endpoint{}, []MulticastPort{}, false, false, ""}

// IP -> Iface map
var gIfaceMap = map[string]string{}

var WireguardSocketPath = TEST_PREFIX + "/state/plugins/wireguard/wireguard_plugin"
var BASE_READY = TEST_PREFIX + "/state/base/ready"

var DEVICE_POLICY_PERMIT_PRIVATE_UPSTREAM_ACCESS = "lan_upstream"
var DEVICE_POLICY_NOAPI = "noapi"

const firstOutboundRouteTable = 11

func SyncBaseContainer() {
	// Wait for the base container to grab the flock

	file, err := os.OpenFile(BASE_READY, os.O_RDWR|os.O_CREATE, 0600)
	if err != nil {
		log.Println("[-] Failed to open base ready file", err)
		return
	}
	defer file.Close()

	err = nil
	for err == nil {
		// grab the lock exclusively. If this succeeds, that means base
		// did not finish initializing yet. Unlock and retry after a second.
		err = syscall.Flock(int(file.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
		if err == nil {
			//release the lock -- and wait for bash
			syscall.Flock(int(file.Fd()), syscall.LOCK_UN)
			log.Println("[.] Waiting for base container to initialize")
			time.Sleep(1 * time.Second)
		}
	}
}

func saveFirewallRulesLocked() {
	file, _ := json.MarshalIndent(gFirewallConfig, "", " ")
	err := ioutil.WriteFile(FirewallConfigFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func getPortsFromPortVerdictMap(name string) []string {
	cmd := exec.Command("nft", "-j", "list", "map", "inet", "filter", name)
	stdout, err := cmd.Output()

	ports := []string{}
	//jq .nftables[1].map.elem[][0]
	var data map[string]interface{}
	err = json.Unmarshal(stdout, &data)
	if err != nil {
		log.Println(err)
		return ports
	}
	data2, ok := data["nftables"].([]interface{})
	if !ok {
		return ports
	}
	data3, ok := data2[1].(map[string]interface{})
	if !ok {
		return ports
	}
	data4, ok := data3["map"].(map[string]interface{})
	if !ok {
		return ports
	}
	data5, ok := data4["elem"].([]interface{})
	if !ok {
		return ports
	}
	for _, entry := range data5 {
		entryList, ok := entry.([]interface{})
		if ok {
			port, ok := entryList[0].(float64)
			if ok {
				ports = append(ports, strconv.Itoa(int(port)))
			}
		}
	}
	return ports
}

func setDefaultServicePortsLocked() {
	//this firewall configuration does not know about
	//the default service ports. Populate them and save
	//note: spr_tcp_port_accept was deprecated.
	ports := getPortsFromPortVerdictMap("spr_tcp_port_accept")

	service_ports := []ServicePort{}
	//use UPSTREAM_SERVICES_ENABLE to determine default config
	enable_upstream := os.Getenv("UPSTREAM_SERVICES_ENABLE") != ""

	for _, port := range ports {
		service_ports = append(service_ports, ServicePort{"tcp", port, enable_upstream})
	}

	gFirewallConfig.ServicePorts = service_ports

	saveFirewallRulesLocked()
}

func loadFirewallRules() error {
	FWmtx.Lock()
	defer FWmtx.Unlock()
	data, err := ioutil.ReadFile(FirewallConfigFile)
	if err != nil {
		log.Println("[-] Empty firewall configuration, initializing")
	} else {
		err := json.Unmarshal(data, &gFirewallConfig)
		if err != nil {
			log.Println("[-] Failed to decode firewall configuration, initializing")
		}
	}
	if len(gFirewallConfig.ServicePorts) == 0 {
		setDefaultServicePortsLocked()
	}

	migrateFirewallGroupsToPolicies()

	return nil
}

func migrateFirewallGroupsToPolicies() {
	//0.3.7  introduces policies in addition to tags and groups

	updated := false
	for i := range gFirewallConfig.CustomInterfaceRules {
		a := gFirewallConfig.CustomInterfaceRules[i]

		new_policies := []string{}
		new_groups := []string{}
		for _, group_name := range a.Groups {
			if slices.Contains(ValidPolicyStrings, group_name) {
				new_policies = append(new_policies, group_name)
			} else {
				new_groups = append(new_groups, group_name)
			}
		}

		if len(new_policies) != 0 {
			//update it
			updated = true
			a.Policies = new_policies
			a.Groups = new_groups
			gFirewallConfig.CustomInterfaceRules[i] = a
		}
	}

	//flush changes to disk
	if updated {
		log.Println("Migrating container interface rules")
		saveFirewallRulesLocked()
	}
}

func isLinkReallyUpNetlink(interfaceName string) bool {
	link, err := netlink.LinkByName(interfaceName)
	if err != nil {
		log.Printf("Failed to get link %s: %v", interfaceName, err)
		return false
	}

	attrs := link.Attrs()
	return (attrs.Flags&net.FlagUp != 0) && (attrs.RawFlags&unix.IFF_RUNNING != 0)
}

// getDefaultGatewayForSubnet returns the first possible host IP for a given subnet
func getDefaultGatewayForSubnet(subnet string) string {
	// Parse the IP address and the network mask
	_, ipnet, err := net.ParseCIDR(subnet)
	if err != nil {
		log.Printf("Unable to parse the subnet: %v", err)
		return ""
	}

	ip := ipnet.IP

	// Convert to 4-byte representation
	ip4 := ip.To4()
	if ip4 == nil {
		log.Printf("Not a valid IPv4 address: %v", ip)
		return ""
	}

	// Calculate the first possible host IP in the subnet
	ip4[3] += 1

	// Check if the IP is still within the subnet range
	if !ipnet.Contains(ip4) {
		log.Printf("Calculated gateway IP is not within the subnet: %v", ip4)
		return ""
	}

	return ip4.String()
}

func getDefaultGatewayLocked(dev string) (string, error) {
	interfaces := loadInterfacesConfigLocked()

	// if dhcp is disabled, grab the router address
	for _, iface := range interfaces {
		if iface.Name == dev {
			if iface.DisableDHCP == true {
				return iface.Router, nil
			}
		}
	}

	// first check the state file
	stateFile := "/state/dhcp-client/gateway." + dev
	router, err := ioutil.ReadFile(stateFile)
	if err == nil && string(router) != "" {
		return strings.TrimSuffix(string(router), "\n"), nil
	}

	//otherwise guess that  the router is at the start as a fallback.
	//NOTE: this will fail if DHCP is elsewhere.

	ifaces, err := net.Interfaces()
	if err != nil {
		return "", err
	}

	for _, iface := range ifaces {
		if iface.Name != dev {
			continue
		}

		addrs, err := iface.Addrs()
		if err != nil {
			return "", err
		}

		for _, addr := range addrs {
			if ipnet, ok := addr.(*net.IPNet); ok {
				if ip4 := ipnet.IP.To4(); ip4 != nil {
					return getDefaultGatewayForSubnet(ipnet.String()), nil
				}
			}
		}
	}

	return "", fmt.Errorf("gateway not found")
}

// false -> did not set Gateway
// true -> have a gateway or did not set one
func setDefaultUplinkGateway(iface string, index int) bool {
	// do not mess with route for mesh for now
	if isLeafRouter() {
		return false
	}

	gateway, err := getDefaultGatewayLocked(iface)
	if err != nil || gateway == "" {
		//no gateway found, continue on
		if err != nil {
			//only log when err is not nil
			log.Println("failed to get default gw for "+iface+": not found", err)
		}
		return false
	}

	table := fmt.Sprintf("%d", firstOutboundRouteTable+index)

	current_table_route := getRouteGatewayForTable(table)
	if current_table_route == gateway {
		// route already set, make no updates
		return true
	}

	ret := true
	cmd := exec.Command("ip", "route", "replace", "default", "via", gateway, "dev", iface, "table", table)
	_, err = cmd.Output()
	if err != nil {
		log.Print("Error with route setup", cmd, err)
		ret = false
	}

	cmd = exec.Command("ip", "route", "flush", "cache")
	_, _ = cmd.Output()
	return ret
}

func updateOutboundRoutes() {
	ticker := time.NewTicker(10 * time.Second)
	for {
		select {
		case <-ticker.C:
			Interfacesmtx.Lock()
			outbound := collectOutbound()
			Interfacesmtx.Unlock()

			FWmtx.Lock()
			for i, iface := range outbound {
				//TBD check that the interface actually reaches the internet
				// if it does not, move it into a deactivated state and rebuild uplink
				setDefaultUplinkGateway(iface, i)
			}
			FWmtx.Unlock()
		}
	}
}

func collectOutbound() []string {
	//assumes Interfacesmtx is locked

	interfaces := loadInterfacesConfigLocked()

	outbound := []string{}
	for _, iface := range interfaces {
		if iface.Type == "Uplink" && iface.Subtype != "pppup" && iface.Enabled {

			if !isLinkReallyUpNetlink(iface.Name) {
				continue
			}

			gw, _ := getDefaultGatewayLocked(iface.Name)
			if gw == "" {
				//no gateway set, reject this outbound
				continue
			}

			outbound = append(outbound, iface.Name)
			if len(outbound) > 128 {
				//rules start at 11. 253/254/255 reserved
				log.Println("Too many outbound interfaces, truncating")
				break
			}
		}
	}
	return outbound
}

func rebuildUplink() {

	outbound := collectOutbound()

	cmd := exec.Command("nft", "flush", "chain", "inet", "mangle", "OUTBOUND_UPLINK")
	_, err := cmd.Output()
	if err != nil {
		log.Println("failed to flush chain mangle OUTBOUND_UPLINK", err)
		return
	}

	if len(outbound) < 2 {
		//dont need more, outbound will work as is

		if len(outbound) == 1 {
			//ensure we have the gw set
			gw, _ := getDefaultGatewayLocked(outbound[0])
			if gw != "" {
				exec.Command("ip", "route", "replace", "default", "via", gw, "dev", outbound[0]).Output()
			}
		}
		return
	}

	if isLeafRouter() {
		// do not mess with OUTBDOUND_UPLINK for mesh for now, rely on br0
		return
	}

	uplinkSettings := loadUplinksConfig()

	//saddr.daddr strategy assumed by default
	strategy := "jhash ip saddr . ip daddr"
	if uplinkSettings.LoadBalanceStrategy == "saddr" {
		strategy = "jhash ip saddr"
		//saddr can be more consistent but has poor balancing
	}

	rule := "add rule inet mangle OUTBOUND_UPLINK " +
		"iif != lo iifname != \"site*\" " +
		"iifname != @uplink_interfaces ip daddr != @supernetworks " +
		"ip daddr != 224.0.0.0/4 meta mark set " + strategy + fmt.Sprintf(" mod %d offset %d", len(outbound), firstOutboundRouteTable)

	cmd = exec.Command("nft", strings.Fields(rule)...)

	_, err = cmd.Output()
	if err != nil {
		log.Println("failed to insert rule", cmd, err)
		return
	}

	for index, outboundInterface := range outbound {
		tableNumber := firstOutboundRouteTable + index
		markNumber := tableNumber
		indexStr := fmt.Sprintf("%d", markNumber)

		// Delete the existing rule, if any.
		cmd = exec.Command("ip", "rule", "del", "fwmark", fmt.Sprintf("%d", markNumber), "table", indexStr)
		_, _ = cmd.Output() // Ignore errors, as the rule may not exist yet.

		// Add a rule that matches the packet mark to the routing table.
		cmd = exec.Command("ip", "rule", "add", "fwmark", fmt.Sprintf("%d", markNumber), "table", indexStr)
		_, err = cmd.Output()
		if err != nil {
			log.Printf("failed to add rule for mark %d: %v", markNumber, err)
			continue
		}

		setDefaultUplinkGateway(outboundInterface, index)

		//create a utility mangle chain as well
		err = exec.Command("nft", "list", "chain", "inet", "mangle", "mark"+indexStr).Run()
		if err != nil {
			//create it
			err = exec.Command("nft", "add", "chain", "inet", "mangle", "mark"+indexStr).Run()
			if err != nil {
				log.Println("nft add chain "+indexStr+" failed", err)
				continue
			}

			err = exec.Command("nft", "add", "rule", "inet", "mangle", "mark"+indexStr,
				"meta", "mark", "set", indexStr).Run()
			if err == nil {
				err = exec.Command("nft", "add", "rule", "inet", "mangle", "mark"+indexStr,
					"accept").Run()
			}
			if err != nil {
				//delete the chain
				err = exec.Command("nft", "delete", "chain", "inet", "mangle", "mark"+indexStr).Run()
				log.Println("failed to add rule for mark"+indexStr, err)
				continue
			}
		}

	}

	// Flush the route cache to ensure the new route is used immediately.
	cmd = exec.Command("ip", "route", "flush", "cache")
	_, err = cmd.Output()
	if err != nil {
		log.Printf("failed to flush route cache: %v", err)
	}

}

func modifyUplinkEntry(ifname, action string, rebuild bool) error {
	cmd := exec.Command("nft", action, "element", "inet", "filter",
		"uplink_interfaces", "{", ifname, "}")

	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to "+action+" uplink_interfaces element", err)
		log.Println(cmd)
	}

	cmd = exec.Command("nft", action, "element", "inet", "nat",
		"uplink_interfaces", "{", ifname, "}")

	_, err = cmd.Output()

	if err != nil {
		log.Println("failed to "+action+" uplink_interfaces element", err)
		log.Println(cmd)
	}

	cmd = exec.Command("nft", action, "element", "inet", "mangle",
		"uplink_interfaces", "{", ifname, "}")

	_, err = cmd.Output()

	if err != nil {
		log.Println("failed to "+action+" uplink_interfaces element", err)
		log.Println(cmd)
	}

	if rebuild {
		rebuildUplink()
	}

	return err
}

func addUplinkEntry(ifname, subtype string, rebuild bool) {
	if subtype == "pppup" {
		//ppp-up connects a ppp to the internt
		//but packets go directly through the ppp not the pppup provider
		return
	}
	modifyUplinkEntry(ifname, "add", rebuild)

}
func removeUplinkEntry(ifname string, rebuild bool) {
	modifyUplinkEntry(ifname, "delete", rebuild)
}

func flushSupernetworkEntries() {
	exec.Command("nft", "flush", "set", "ip", "accounting", "local_lan").Output()
	exec.Command("nft", "flush", "set", "inet", "mangle", "supernetworks").Output()
	exec.Command("nft", "flush", "set", "ip", "filter", "supernetworks").Output()
}

func modifySupernetworkEntry(supernet, action string) {
	cmd := exec.Command("nft", action, "element", "inet", "mangle",
		"supernetworks", "{", supernet, "}")

	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to "+action+" mangle supernetworks element", err)
		log.Println(cmd)
	}

	cmd = exec.Command("nft", action, "element", "inet", "filter",
		"supernetworks", "{", supernet, "}")

	_, err = cmd.Output()

	if err != nil {
		log.Println("failed to "+action+" filter supernetworks element", err)
		log.Println(cmd)
	}

	//also updated it under accounting
	cmd = exec.Command("nft", action, "element", "ip", "accounting", "local_lan", "{", supernet, "}")
	_, err = cmd.Output()

	if err != nil {
		log.Println("failed to "+action+" accounting supernetworks element", err)
		log.Println(cmd)
	}

}

func addSupernetworkEntry(supernet string) {
	modifySupernetworkEntry(supernet, "add")
}

func removeSupernetworkEntry(supernet string) {
	modifySupernetworkEntry(supernet, "delete")
}

func modifyCustomInterfaceRules(w http.ResponseWriter, r *http.Request) {
	FWmtx.Lock()
	defer FWmtx.Unlock()

	crule := CustomInterfaceRule{}
	err := json.NewDecoder(r.Body).Decode(&crule)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	doDelete := r.Method == http.MethodDelete
	err = modifyCustomInterfaceRulesImpl(crule, doDelete)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

}

func modifyCustomInterfaceRulesImpl(crule CustomInterfaceRule, doDelete bool) error {
	if CIDRorIP(crule.SrcIP) != nil {
		return fmt.Errorf("Invalid SrcIP")
	}

	if crule.RouteDst != "" {
		ip := net.ParseIP(crule.RouteDst)
		if ip == nil {
			return fmt.Errorf("Invalid RouteDst")
		}
	}

	if !isValidIface(crule.Interface) {
		return fmt.Errorf("Invalid Interface")
	}

	crule.Groups = normalizeStringSlice(crule.Groups)
	crule.Policies = normalizeStringSlice(crule.Policies)
	//tags not used for anything yet
	crule.Tags = normalizeStringSlice(crule.Tags)

	if slices.Contains(crule.Policies, DEVICE_POLICY_PERMIT_PRIVATE_UPSTREAM_ACCESS) {
		if strings.Contains(crule.SrcIP, "/") {
			return fmt.Errorf("lan_upstream policy not yet supported with SrcIP ranges")
		}
	}

	if len(crule.Tags) > 0 {
		if strings.Contains(crule.SrcIP, "/") {
			return fmt.Errorf("Tags not yet supported with SrcIP ranges")
		}
	}

	if doDelete {
		for i := range gFirewallConfig.CustomInterfaceRules {
			a := gFirewallConfig.CustomInterfaceRules[i]
			if crule.Equals(&a) {
				gFirewallConfig.CustomInterfaceRules = append(gFirewallConfig.CustomInterfaceRules[:i], gFirewallConfig.CustomInterfaceRules[i+1:]...)
				saveFirewallRulesLocked()
				err := applyCustomInterfaceRule(gFirewallConfig.CustomInterfaceRules, a, "delete", true)
				if err != nil {
					return err
				}
				return nil
			}
		}
		return fmt.Errorf("Not found")
	}

	//lastly, check for duplicates on RouteDst, SrcIP, interface name
	// and reject them
	for _, current := range gFirewallConfig.CustomInterfaceRules {
		if crule.SrcIP == current.SrcIP &&
			crule.RouteDst == current.RouteDst &&
			crule.Interface == current.Interface {
			return fmt.Errorf("Duplicate rule")
		}
	}

	gFirewallConfig.CustomInterfaceRules = append(gFirewallConfig.CustomInterfaceRules, crule)
	saveFirewallRulesLocked()
	applyFirewallRulesLocked()
	return nil
}

func deleteBlock(br BlockRule) error {
	cmd := exec.Command("nft", "delete", "element", "inet", "nat", "block", "{",
		br.SrcIP, ".", br.DstIP, ".", br.Protocol, ":", "drop", "}")

	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to delete element", err)
		log.Println(cmd)
	}

	return err
}

func deleteOutputBlock(br OutputBlockRule) error {
	cmd := exec.Command("nft", "delete", "element", "inet", "filter", "output_block", "{",
		br.SrcIP, ".", br.DstIP, ".", br.Protocol, ":", "drop", "}")

	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to delete element", err)
		log.Println(cmd)
	}

	return err
}

func deleteForwarding(f ForwardingRule) error {
	var cmd *exec.Cmd
	if f.DstPort == "any" {
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
		log.Println("failed to delete element", err)
		log.Println(cmd)
	}

	return err

}

func applyForwarding(forwarding []ForwardingRule) error {

	//need to flush the fwd rules here ?

	for _, f := range forwarding {
		var cmd *exec.Cmd
		if f.DstPort == "any" {
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
			log.Println("failed to add element", err)
			log.Println(cmd)
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
			log.Println("failed to add element", err)
			log.Println(cmd)
		}
	}

	return nil
}

func applyOutputBlocking(blockRules []OutputBlockRule) error {
	for _, br := range blockRules {
		cmd := exec.Command("nft", "add", "element", "inet", "filter", "output_block", "{",
			br.SrcIP, ".", br.DstIP, ".", br.Protocol, ":", "drop", "}")

		_, err := cmd.Output()

		if err != nil {
			log.Println("failed to add element", err)
			log.Println(cmd)
		}
	}

	return nil
}

func applyForwardBlocking(blockRules []ForwardingBlockRule) error {

	for _, br := range blockRules {
		addForwardBlock(br)
	}

	return nil
}

func deletePortVmap(port string, vmap string) error {

	//check if it exists
	cmd := exec.Command("nft", "get", "element", "inet", "filter", vmap,
		"{", port, ":", "accept", "}")
	_, err := cmd.Output()

	if err == nil {

		cmd := exec.Command("nft", "delete", "element", "inet", "filter", vmap,
			"{", port, ":", "accept", "}")
		_, err := cmd.Output()

		if err != nil {
			log.Println("failed to delete element from "+vmap, err)
			log.Println(cmd)
		}
	}

	return err
}

func addPortVmap(port string, vmap string) error {

	//check if it exists
	cmd := exec.Command("nft", "get", "element", "inet", "filter", vmap,
		"{", port, ":", "accept", "}")
	_, err := cmd.Output()

	if err != nil {
		//entry did not already exist, add it.

		cmd := exec.Command("nft", "add", "element", "inet", "filter", vmap,
			"{", port, ":", "accept", "}")
		_, err := cmd.Output()

		if err != nil {
			log.Println("failed to add element to "+vmap, err)
			log.Println(cmd)
			return err
		}
	}

	return nil
}

func deleteServicePort(port ServicePort) error {

	if port.Protocol != "tcp" && port.Protocol != "udp" {
		log.Println("[-] Error: non TCP/UDP port described, unsupported")
		return fmt.Errorf("invalid protocol for service port")
	}

	vmap := "lan_" + port.Protocol + "_accept"

	err := deletePortVmap(port.Port, vmap)
	if err != nil {
		fmt.Println("errored out adding service port", err)
	}

	// delete from upstream as well
	if port.UpstreamEnabled {
		vmap = "wan_" + port.Protocol + "_accept"
		err = deletePortVmap(port.Port, vmap)
		if err != nil {
			fmt.Println("errored out adding service port", err)
		}
	}

	return err
}

func addServicePort(port ServicePort) error {

	if port.Protocol != "tcp" && port.Protocol != "udp" {
		log.Println("[-] Error: non TCP/udp port described, unsupported")
		return fmt.Errorf("invalid protocol for service port")
	}

	vmap := "lan_" + port.Protocol + "_accept"

	err := addPortVmap(port.Port, vmap)
	if err != nil {
		fmt.Println("errored out adding service port", err)
		return err
	}

	vmap = "wan_" + port.Protocol + "_accept"

	// add to upstream as well
	if port.UpstreamEnabled {
		err = addPortVmap(port.Port, vmap)
	} else {
		//ensure deleted
		err = deletePortVmap(port.Port, vmap)
	}

	return nil
}

func applyServicePorts(servicePorts []ServicePort) error {

	exec.Command("nft", "flush", "map", "inet", "filter", "lan_tcp_accept").Run()
	exec.Command("nft", "flush", "map", "inet", "filter", "wan_tcp_accept").Run()
	exec.Command("nft", "flush", "map", "inet", "filter", "lan_udp_accept").Run()
	exec.Command("nft", "flush", "map", "inet", "filter", "wan_udp_accept").Run()

	for _, port := range servicePorts {
		addServicePort(port)
	}

	return nil
}

func deleteMulticastPort(port MulticastPort) error {
	err := deletePortVmap(port.Port, "multicast_lan_udp_accept")
	if port.Upstream == true {
		return deletePortVmap(port.Port, "multicast_wan_udp_accept")
	}
	return err
}

func addMulticastPort(port MulticastPort) error {

	err := addPortVmap(port.Port, "multicast_lan_udp_accept")
	if port.Upstream == true {
		return addPortVmap(port.Port, "multicast_wan_udp_accept")
	} else {
		//ensure deleted
		err = deletePortVmap(port.Port, "Multicast_wan_udp_accept")
	}

	return err
}

func applyMulticastPorts(multicastPorts []MulticastPort) error {
	//reset multicast ports
	exec.Command("nft", "flush", "map", "ip", "filter", "multicast_lan_udp_accept").Run()
	exec.Command("nft", "flush", "map", "ip", "filter", "multicast_wan_udp_accept").Run()

	foundMDNS := false
	for _, port := range multicastPorts {
		if isSetupMode() {
			//during setup do allow wan interfaces to mdns
			if port.Port == "5353" {
				port.Upstream = true
				foundMDNS = true
			}
		}
		addMulticastPort(port)
	}

	if isSetupMode() && !foundMDNS {
		//during setup, do allow mdns from upstream.
		addMulticastPort(MulticastPort{Port: "5353", Upstream: true})
	}

	return nil
}

func hasFirewallDeviceEndpointEntry(srcIP string, e Endpoint) bool {

	cmd := exec.Command("nft", "get", "element", "inet", "filter", "ept_"+e.Protocol+"fwd",
		"{", srcIP, ".", e.IP, ".", e.Port, ":", "accept", "}")

	_, err := cmd.Output()
	return err == nil
}

func addDeviceEndpointEntry(srcIP string, e Endpoint) {

	cmd := exec.Command("nft", "add", "element", "inet", "filter", "ept_"+e.Protocol+"fwd",
		"{", srcIP, ".", e.IP, ".", e.Port, ":", "accept", "}")

	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to add element", err)
		log.Println(cmd)
	}

}

func deleteDeviceEndpointEntry(srcIP string, e Endpoint) {

	cmd := exec.Command("nft", "delete", "element", "inet", "filter", "ept_"+e.Protocol+"fwd",
		"{", srcIP, ".", e.IP, ".", e.Port, ":", "accept", "}")

	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to delete element", err)
		log.Println(cmd)
	}

}

func deleteEndpoint(e Endpoint) error {
	//NOTE: Domains not implemented yet. This handles the IP case
	if e.IP == "" {
		return fmt.Errorf("Domain not implemented yet for " + e.RuleName)
	}

	Devicesmtx.Lock()
	devices := getDevicesJson()
	Devicesmtx.Unlock()

	for _, d := range devices {
		if d.RecentIP == "" {
			continue
		}

		if hasFirewallDeviceEndpointEntry(d.RecentIP, e) {
			deleteDeviceEndpointEntry(d.RecentIP, e)
		}
	}

	return nil
}

func applyEndpointRules(device DeviceEntry) {
	IP := device.RecentIP
	if IP == "" {
		return
	}

	for _, e := range gFirewallConfig.Endpoints {

		deviceMatchesEndpoint := false

		for _, e_tag := range e.Tags {
			for _, tag := range device.DeviceTags {
				if e_tag == tag {
					deviceMatchesEndpoint = true
					goto next
				}
			}
		}

	next:

		hasAccess := hasFirewallDeviceEndpointEntry(IP, e)

		if deviceMatchesEndpoint && !hasAccess {
			addDeviceEndpointEntry(IP, e)
		} else if !deviceMatchesEndpoint && hasAccess {
			deleteDeviceEndpointEntry(IP, e)
		}
	}
}

func hasPrivateUpstreamAccess(ip string) bool {
	cmd := exec.Command("nft", "get", "element", "inet", "filter", "upstream_private_rfc1918_allowed",
		"{", ip, ":", "return", "}")
	_, err := cmd.Output()
	return err == nil
}

func allowPrivateUpstreamAccess(ip string) error {
	cmd := exec.Command("nft", "add", "element", "inet", "filter", "upstream_private_rfc1918_allowed",
		"{", ip, ":", "return", "}")
	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to add element to upstream_private_rfc1918_allowed", err)
		log.Println(cmd)
	}

	return err
}

func removePrivateUpstreamAccess(ip string) error {
	cmd := exec.Command("nft", "delete", "element", "inet", "filter", "upstream_private_rfc1918_allowed",
		"{", ip, ":", "return", "}")
	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to remove element from upstream_private_rfc1918_allowed", err)
		log.Println(cmd)
	}

	return err
}

func applyPrivateNetworkUpstreamDevice(device DeviceEntry) {
	IP := device.RecentIP
	if IP == "" {
		return
	}

	foundPolicy := slices.Contains(device.Policies, DEVICE_POLICY_PERMIT_PRIVATE_UPSTREAM_ACCESS)
	inUpstreamAllowed := hasPrivateUpstreamAccess(IP)

	if foundPolicy && !inUpstreamAllowed {
		//if has the tag but not in the verdict map, add it
		allowPrivateUpstreamAccess(IP)
	} else if !foundPolicy && inUpstreamAllowed {
		//if in the verdict map but does not have the policy, remove it
		removePrivateUpstreamAccess(IP)
	}
}

func hasNoAPIAccess(ip string) bool {
	cmd := exec.Command("nft", "get", "element", "inet", "filter", "api_block",
		"{", ip, "}")
	_, err := cmd.Output()
	return err == nil
}

func addNoAPIAccess(ip string) error {
	cmd := exec.Command("nft", "add", "element", "inet", "filter", "api_block",
		"{", ip, "}")
	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to add element to api_block", err)
		log.Println(cmd)
	}

	return err
}

func removeNoAPIAccess(ip string) error {
	cmd := exec.Command("nft", "delete", "element", "inet", "filter", "api_block",
		"{", ip, "}")
	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to remove element from api_block", err)
		log.Println(cmd)
	}

	return err
}

func applyNoAPI(device DeviceEntry) {
	IP := device.RecentIP
	if IP == "" {
		return
	}

	foundPolicy := slices.Contains(device.Policies, DEVICE_POLICY_NOAPI)
	inNoApi := hasNoAPIAccess(IP)

	if foundPolicy && !inNoApi {
		//if has the tag but not in the verdict map, add it
		addNoAPIAccess(IP)
	} else if !foundPolicy && inNoApi {
		//if in the verdict map but does not have the policy, remove it
		removeNoAPIAccess(IP)
	}
}

func applyBuiltinTagFirewallRules() {
	Devicesmtx.Lock()
	devices := getDevicesJson()
	Devicesmtx.Unlock()

	for _, device := range devices {
		applyEndpointRules(device)
	}
}

func refreshDeviceTags(dev DeviceEntry) {
	go func() {
		FWmtx.Lock()
		applyEndpointRules(dev)
		FWmtx.Unlock()
	}()
}

func refreshDeviceGroupsAndPolicy(devices map[string]DeviceEntry, groups []GroupEntry, dev DeviceEntry) {
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

	device_disabled := slices.Contains(dev.Policies, "disabled") || dev.DeviceDisabled == true
	if !device_disabled {
		//add this MAC and IP to the ethernet filter. wg is a no-op
		addVerdictMac(ipv4, dev.MAC, ifname, "ethernet_filter", "return")

		//and re-add
		populateVmapEntries(devices, groups, ipv4, dev.MAC, ifname, "", dev.DNSCustom)
	}

}

func applyPingRules() {
	Interfacesmtx.Lock()
	interfaces := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()

	cmd := exec.Command("nft", "flush", "map", "inet", "filter", "ping_rules")
	_, err := cmd.Output()
	if err != nil {
		fmt.Println("- Failed to flush ping map", err)
		return
	}

	pingWan := gFirewallConfig.PingWan
	pingLan := gFirewallConfig.PingLan

	if isSetupMode() {
		//during set up mode override and do ping wan / lan regardless.
		pingWan = true
		pingLan = true
	}

	if len(interfaces) == 0 {
		//interfaces not ready to go.

		if pingWan {
			cmd = exec.Command("nft", "add", "element", "inet", "filter", "ping_rules",
				"{", "0.0.0.0/0", ".", os.Getenv("WANIF"), ":", "accept", "}")
			err = cmd.Run()
			if err != nil {
				fmt.Println("[-] Ping rule failed to add wan", err)
			}
		}

		if pingLan {
			cmd = exec.Command("nft", "add", "element", "inet", "filter", "ping_rules",
				"{", "0.0.0.0/0", ".", os.Getenv("LANIF"), ":", "accept", "}")
			err = cmd.Run()
			if err != nil {
				fmt.Println("[-] Ping rule failed to add lan", err)
			}

			//also add wireguard to the ping rules
			//future: gate this on wg being enabled
			cmd = exec.Command("nft", "add", "element", "inet", "filter", "ping_rules",
				"{", "0.0.0.0/0", ".", "wg0", ":", "accept", "}")
			err = cmd.Run()
			if err != nil {
				fmt.Println("[-] Ping rule failed to add wg0", err)
			}

		}

		return
	}

	for _, iface := range interfaces {
		if iface.Type == "Uplink" && pingWan {
			cmd = exec.Command("nft", "add", "element", "inet", "filter", "ping_rules",
				"{", "0.0.0.0/0", ".", iface.Name, ":", "accept", "}")
			err = cmd.Run()
			if err != nil {
				fmt.Println("[-] Ping rule failed to add", err)
			}
		} else if iface.Type == "AP" && pingLan {
			cmd = exec.Command("nft", "add", "element", "inet", "filter", "ping_rules",
				"{", "0.0.0.0/0", ".", iface.Name+".*", ":", "accept", "}")
			_, err = cmd.Output()
			if err != nil {
				fmt.Println("[-] Ping rule failed to add", err)
			}
		} else if iface.Type == "Downlink" && pingLan {
			cmd = exec.Command("nft", "add", "element", "inet", "filter", "ping_rules",
				"{", "0.0.0.0/0", ".", iface.Name, ":", "accept", "}")
			_, err = cmd.Output()
			if err != nil {
				fmt.Println("[-] Ping rule failed to add", err)
			}

			if iface.Subtype == "VLAN-Trunk" {
				//add vlan interfaces as well for vlan trunk
				cmd = exec.Command("nft", "add", "element", "inet", "filter", "ping_rules",
					"{", "0.0.0.0/0", ".", iface.Name+".*", ":", "accept", "}")
				_, err = cmd.Output()
				if err != nil {
					fmt.Println("[-] Ping rule failed to add", err)
				}
			}
		}
	}

}

func getWanif() string {
	//tbd, use interfaces.json ?
	return os.Getenv("WANIF")
}

func getWanifs() []string {
	Interfacesmtx.Lock()
	interfaces := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()

	wanifs := []string{}

	for _, iface := range interfaces {
		if iface.Type == "Uplink" && iface.Enabled == true {
			wanifs = append(wanifs, iface.Name)
		}
	}

	return wanifs
}

func populateSets() {
	//dhcp config loading already handles supernetworks
	Interfacesmtx.Lock()
	interfaces := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()

	wanif := getWanif()
	found_wanif := false
	for _, iface := range interfaces {
		if iface.Name == wanif {
			found_wanif = true
		}
		if iface.Type == "Uplink" && iface.Enabled == true {
			addUplinkEntry(iface.Name, iface.Subtype, false)
		}
	}

	rebuildUplink()

	//As a migration: when no longer in setup mode,
	//import WANIF into interfaces.json
	if !isSetupMode() && found_wanif == false {
		configureInterface("Uplink", "ethernet", wanif, false, false)
	}

}

// TBD in go 1.21 use slices.
func includesGroupStd(slice []string) (bool, bool, bool, bool) {
	dns := false
	wan := false
	lan := false
	api := false

	for _, item := range slice {
		if item == "dns" {
			dns = true
		} else if item == "wan" {
			wan = true
		} else if item == "lan" {
			lan = true
		} else if item == "api" {
			api = true
		}
	}

	return wan, dns, lan, api
}

func applyCustomInterfaceRule(current_rules_all []CustomInterfaceRule, container_rule CustomInterfaceRule, action string, fthru bool) error {
	current_rules := []CustomInterfaceRule{}
	for _, rule := range current_rules_all {
		//if the Interface name and IP are the same, consider them as affecting
		// the same policy.
		if rule.Interface == container_rule.Interface && rule.SrcIP == container_rule.SrcIP {
			current_rules = append(current_rules, rule)
		}
	}

	wan_count := 0
	dns_count := 0
	lan_count := 0
	api_count := 0
	if action == "delete" {
		for _, rule := range current_rules_all {
			wan_, dns_, lan_, api_ := includesGroupStd(rule.Policies)

			//api_interfaces is only on Interface naem
			if rule.Interface == container_rule.Interface {
				if api_ {
					api_count++
				}
			}

			//for others its Interface + SrcIP
			if rule.Interface == container_rule.Interface && rule.SrcIP == container_rule.SrcIP {
				if wan_ {
					wan_count++
				}
				if dns_ {
					dns_count++
				}
				if lan_ {
					lan_count++
				}
			}
		}
	}

	var err error

	wan, dns, lan, api := includesGroupStd(container_rule.Policies)

	//if action is delete, ensure no other rules use this policy on this interface
	if wan && (action != "delete" || wan_count == 0) {
		err = exec.Command("nft", action, "element", "inet", "filter", "fwd_iface_wan",
			"{", container_rule.Interface, ".", container_rule.SrcIP, ":", "accept", "}").Run()
		if err != nil {
			if action != "delete" {
				log.Println("failed to "+action+" "+container_rule.Interface+" "+container_rule.SrcIP+" on fwd_iface_wan", err)
			}
			if !fthru {
				return err
			}
		}
	}

	if lan && (action != "delete" || lan_count == 0) {
		err = exec.Command("nft", action, "element", "inet", "filter", "fwd_iface_lan",
			"{", container_rule.Interface, ".", container_rule.SrcIP, ":", "accept", "}").Run()
		if err != nil {
			if action != "delete" {
				log.Println("failed to "+action+" "+container_rule.Interface+" "+container_rule.SrcIP+" on fwd_iface_lan", err)
			}
			if !fthru {
				return err
			}
		}
	}

	if dns && (action != "delete" || dns_count == 0) {
		err = exec.Command("nft", action, "element", "inet", "filter", "dns_access",
			"{", container_rule.SrcIP, ".", container_rule.Interface, ":", "accept", "}").Run()
		if err != nil {
			if action != "delete" {
				log.Println("failed to  "+action+" "+container_rule.Interface+" "+container_rule.SrcIP+" on dns_access", err)
			}
			if !fthru {
				return err
			}
		}
	}

	if api && (action != "delete" || api_count == 0) {
		err = exec.Command("nft", action, "element", "inet", "filter", "api_interfaces",
			"{", container_rule.Interface, "}").Run()
		if err != nil {
			if action != "delete" {
				log.Println("failed to  "+action+" "+container_rule.Interface+" for @api_interfaces", err)
			}
			if !fthru {
				return err
			}
		}
	}

	for _, group := range container_rule.Groups {
		if group == "lan" || group == "dns" || group == "wan" || group == "api" {
			log.Println("Warning, unexpected migrated group in container rule " + group)
			continue
		}
		if action == "add" {
			Groupsmtx.Lock()
			addGroupsIfMissing(getGroupsJson(), []string{group})
			Groupsmtx.Unlock()
			addCustomVerdict(group, container_rule.SrcIP, container_rule.Interface)
		} else {
			found := false
			for _, rule := range current_rules {
				if slices.Contains(rule.Groups, group) {
					found = true
					break
				}
			}

			if !found {
				//clear rule from group.
				err := exec.Command("nft", "delete", "element", "inet", "filter", group+"_src_access", "{", container_rule.SrcIP, ".", container_rule.Interface, ":", "accept", "}").Run()
				if err != nil {
					log.Println("[-] Error container_interface group nft delete failed", err)
				}

				err = exec.Command("nft", "delete", "element", "inet", "filter", group+"_dst_access", "{", container_rule.SrcIP, ".", container_rule.Interface, ":", "continue", "}").Run()
				if err != nil {
					log.Println("[-]  Error container_interface group  nft delete failed", err)
				}
			}

		}
	}

	foundPolicy := slices.Contains(container_rule.Policies, DEVICE_POLICY_PERMIT_PRIVATE_UPSTREAM_ACCESS)
	if !strings.Contains(container_rule.SrcIP, "/") {
		inUpstreamAllowed := hasPrivateUpstreamAccess(container_rule.SrcIP)
		if foundPolicy && !inUpstreamAllowed {
			//if has the tag but not in the verdict map, add it
			allowPrivateUpstreamAccess(container_rule.SrcIP)
		} else if !foundPolicy && inUpstreamAllowed {
			//if in the verdict map but does not have the tag, remove it
			removePrivateUpstreamAccess(container_rule.SrcIP)
		}
	}

	//set up route
	if container_rule.RouteDst != "" {

		ip := net.ParseIP(container_rule.RouteDst)
		if ip == nil {
			return fmt.Errorf("invalid ip " + container_rule.RouteDst)
		}

		if action == "add" {
			exec.Command("ip", "route", "add", container_rule.SrcIP, "via", container_rule.RouteDst).Run()
		} else if action == "delete" {
			exec.Command("ip", "route", "del", container_rule.SrcIP, "via", container_rule.RouteDst).Run()
		}
	}

	return err
}

func applyContainerInterfaces() {
	err := exec.Command("nft", "flush", "map", "inet", "filter", "fwd_iface_wan").Run()
	if err != nil {
		log.Println("failed to flush fwd_iface_wan", err)
	}

	err = exec.Command("nft", "flush", "map", "inet", "filter", "fwd_iface_lan").Run()
	if err != nil {
		log.Println("failed to flush fwd_iface_lan", err)
	}

	dockerif := os.Getenv("DOCKERIF")
	dockernet := os.Getenv("DOCKERNET")

	if dockerif != "" && dockernet != "" {
		//prepopulate default docker0
		err = exec.Command("nft", "add", "element", "inet", "filter", "fwd_iface_wan",
			"{", dockerif, ".", dockernet, ":", "accept", "}").Run()
		if err != nil {
			log.Println("failed to populate "+dockerif+" "+dockernet+" on fwd_iface_wan", err)
		}

		err = exec.Command("nft", "add", "element", "inet", "filter", "fwd_iface_lan",
			"{", dockerif, ".", dockernet, ":", "accept", "}").Run()
		if err != nil {
			log.Println("failed to populate "+dockerif+" "+dockernet+" on fwd_iface_lan", err)
		}
	}

	for _, container_rule := range gFirewallConfig.CustomInterfaceRules {
		applyCustomInterfaceRule(gFirewallConfig.CustomInterfaceRules, container_rule, "add", false)
	}

	// TBD: clean up stale iface from dns_access (?) here

}

func applyFirewallRulesLocked() {

	populateSets()

	applyForwarding(gFirewallConfig.ForwardingRules)

	applyBlocking(gFirewallConfig.BlockRules)

	applyOutputBlocking(gFirewallConfig.OutputBlockRules)

	applyForwardBlocking(gFirewallConfig.ForwardingBlockRules)

	applyServicePorts(gFirewallConfig.ServicePorts)

	applyMulticastPorts(gFirewallConfig.MulticastPorts)

	applyBuiltinTagFirewallRules()

	applyPingRules()

	applyContainerInterfaces()
}

func applyRadioInterfaces(interfacesConfig []InterfaceConfig) {
	cmd := exec.Command("nft", "flush", "chain", "inet", "filter", "WIPHY_FORWARD_LAN")
	_, err := cmd.Output()
	if err != nil {
		log.Println("failed to flush chain", err)
		return
	}

	for _, entry := range interfacesConfig {
		if entry.Enabled == true && entry.Type == "AP" {
			// $(if [ "$VLANSIF" ]; then echo "counter oifname "$VLANSIF*" ip saddr . iifname vmap @lan_access"; fi)

			cmd = exec.Command("nft", "insert", "rule", "inet", "filter", "WIPHY_FORWARD_LAN",
				"counter", "oifname", entry.Name+".*", "ip", "saddr", ".", "iifname", "vmap", "@lan_access")
			_, err = cmd.Output()
			if err != nil {
				log.Println("failed to insert rule", cmd, err)
			}

		}
	}

}

func showNFMap(w http.ResponseWriter, r *http.Request) {
	name := mux.Vars(r)["name"]

	cmd := exec.Command("nft", "-j", "list", "map", "inet", "filter", name)
	stdout, err := cmd.Output()

	if err != nil {
		log.Println("show NFMap failed to list", name, "->", err)
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
		log.Println("show NFMap failed to list ", family, " ", name, "->", err)
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
		log.Println("nft failed to list tables", err)
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
			return fmt.Errorf("invalid ip " + IP)
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

	re := regexp.MustCompile("^([0-9]+-[0-9]+|[0-9]+)$")

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

func blockOutputIP(w http.ResponseWriter, r *http.Request) {
	FWmtx.Lock()
	defer FWmtx.Unlock()

	br := OutputBlockRule{}
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
		for i := range gFirewallConfig.OutputBlockRules {
			a := gFirewallConfig.OutputBlockRules[i]
			if br == a {
				gFirewallConfig.OutputBlockRules = append(gFirewallConfig.OutputBlockRules[:i], gFirewallConfig.OutputBlockRules[i+1:]...)
				saveFirewallRulesLocked()
				deleteOutputBlock(a)
				return
			}
		}
		http.Error(w, "Not found", 404)
		return
	}

	gFirewallConfig.OutputBlockRules = append(gFirewallConfig.OutputBlockRules, br)
	saveFirewallRulesLocked()
	applyFirewallRulesLocked()
}

func blockForwardingIP(w http.ResponseWriter, r *http.Request) {
	FWmtx.Lock()
	defer FWmtx.Unlock()

	br := ForwardingBlockRule{}
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

	re := regexp.MustCompile("^([0-9]+-[0-9]+|[0-9]+)$")

	if !re.MatchString(br.DstPort) {
		http.Error(w, "Invalid DstPort", 400)
		return
	}

	if br.DstPort == "" {
		//all ports
		br.DstPort = "0-65535"
	}

	if r.Method == http.MethodDelete {
		for i := range gFirewallConfig.ForwardingBlockRules {
			a := gFirewallConfig.ForwardingBlockRules[i]
			if br == a {
				gFirewallConfig.ForwardingBlockRules = append(gFirewallConfig.ForwardingBlockRules[:i], gFirewallConfig.ForwardingBlockRules[i+1:]...)
				saveFirewallRulesLocked()
				deleteForwardBlock(a)
				return
			}
		}
		http.Error(w, "Not found", 404)
		return
	}

	gFirewallConfig.ForwardingBlockRules = append(gFirewallConfig.ForwardingBlockRules, br)
	saveFirewallRulesLocked()
	applyFirewallRulesLocked()
}

func modifyServicePort(w http.ResponseWriter, r *http.Request) {
	FWmtx.Lock()
	defer FWmtx.Unlock()

	port := ServicePort{}
	err := json.NewDecoder(r.Body).Decode(&port)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	//only TCP/UDP supported for now
	if port.Protocol != "tcp" && port.Protocol != "udp" {
		http.Error(w, "Invalid protocol, only tcp/udp supported currently", 400)
		return
	}

	re := regexp.MustCompile("^([0-9]+)$")

	if port.Port == "" || !re.MatchString(port.Port) {
		http.Error(w, "Invalid Port", 400)
		return
	}

	if r.Method == http.MethodDelete {
		for i := range gFirewallConfig.ServicePorts {
			a := gFirewallConfig.ServicePorts[i]
			if port.Protocol == a.Protocol && port.Port == a.Port {
				gFirewallConfig.ServicePorts = append(gFirewallConfig.ServicePorts[:i], gFirewallConfig.ServicePorts[i+1:]...)
				saveFirewallRulesLocked()
				applyFirewallRulesLocked()
				deleteServicePort(a)
				return
			}
		}
		http.Error(w, "Not found", 404)
		return
	}

	//update the existing rule  entry
	for i := range gFirewallConfig.ServicePorts {
		a := gFirewallConfig.ServicePorts[i]
		if port.Protocol == a.Protocol && port.Port == a.Port {
			gFirewallConfig.ServicePorts[i].UpstreamEnabled = port.UpstreamEnabled
			saveFirewallRulesLocked()
			applyFirewallRulesLocked()
			return
		}
	}

	gFirewallConfig.ServicePorts = append(gFirewallConfig.ServicePorts, port)
	saveFirewallRulesLocked()
	applyFirewallRulesLocked()
}

func modifyIcmp(w http.ResponseWriter, r *http.Request) {
	FWmtx.Lock()
	defer FWmtx.Unlock()

	type IcmpOptions struct {
		PingLan bool
		PingWan bool
	}

	options := IcmpOptions{}
	err := json.NewDecoder(r.Body).Decode(&options)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	gFirewallConfig.PingLan = options.PingLan
	gFirewallConfig.PingWan = options.PingWan
	saveFirewallRulesLocked()

	applyPingRules()

}

func modifyMulticast(w http.ResponseWriter, r *http.Request) {
	FWmtx.Lock()
	defer FWmtx.Unlock()

	port := MulticastPort{}
	err := json.NewDecoder(r.Body).Decode(&port)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	re := regexp.MustCompile("^([0-9]+)$")

	if port.Port == "" || !re.MatchString(port.Port) {
		http.Error(w, "Invalid Port", 400)
		return
	}

	if r.Method == http.MethodDelete {
		for i := range gFirewallConfig.MulticastPorts {
			a := gFirewallConfig.MulticastPorts[i]
			if port.Port == a.Port {
				gFirewallConfig.MulticastPorts = append(gFirewallConfig.MulticastPorts[:i], gFirewallConfig.MulticastPorts[i+1:]...)
				saveFirewallRulesLocked()
				applyFirewallRulesLocked()
				deleteMulticastPort(a)
				return
			}
		}
		http.Error(w, "Not found", 404)
		return
	}

	//update the existing rule  entry
	for i := range gFirewallConfig.MulticastPorts {
		a := gFirewallConfig.MulticastPorts[i]
		if port.Port == a.Port {
			gFirewallConfig.MulticastPorts[i].Upstream = port.Upstream
			//remove previous entry
			deleteMulticastPort(port)
			saveFirewallRulesLocked()
			applyFirewallRulesLocked()
			return
		}
	}

	gFirewallConfig.MulticastPorts = append(gFirewallConfig.MulticastPorts, port)
	saveFirewallRulesLocked()
	applyFirewallRulesLocked()
}

/*
Endpoints are a utility data structure for storing metadata.

They affect firewall policy when a device and an endpoint share a tag,
that device is permitted to access the endpoint.
*/
func modifyEndpoint(w http.ResponseWriter, r *http.Request) {
	FWmtx.Lock()
	defer FWmtx.Unlock()

	endpoint := Endpoint{}
	err := json.NewDecoder(r.Body).Decode(&endpoint)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if endpoint.RuleName == "" {
		http.Error(w, "Invalid endpoint name", 400)
		return
	}

	if r.Method != http.MethodDelete {
		//when creating perofrm validation beyond rule name
		if endpoint.IP != "" && (CIDRorIP(endpoint.IP) != nil) {
			http.Error(w, "Invalid endpoint IP, must be IP or CIDR", 400)
			return
		}

		if endpoint.IP == "" && endpoint.Domain == "" {
			http.Error(w, "Need either IP or a Domain set", 400)
			return
		}

		if endpoint.IP != "" && endpoint.Domain != "" {
			http.Error(w, "Need either an IP or a Domain, not both", 400)
			return
		}

		if endpoint.Protocol != "tcp" && endpoint.Protocol != "udp" {
			http.Error(w, "Invalid protocol", 400)
			return
		}

		for _, tag := range endpoint.Tags {
			if len(tag) == 0 {
				http.Error(w, "Tag can not be empty", 400)
				return
			}
		}

		re := regexp.MustCompile("^([0-9]+)$")

		if endpoint.Port != "0-65535" && endpoint.Port != "any" && (endpoint.Port == "" || !re.MatchString(endpoint.Port)) {
			http.Error(w, "Invalid Port", 400)
			return
		}

		if endpoint.Port == "any" {
			//special case, convert any to interval
			endpoint.Port = "0-65535"
		}
	}

	if r.Method == http.MethodDelete {
		for i := range gFirewallConfig.Endpoints {
			a := gFirewallConfig.Endpoints[i]
			//find and delete by endpoint Name
			if endpoint.RuleName == a.RuleName {
				gFirewallConfig.Endpoints = append(gFirewallConfig.Endpoints[:i], gFirewallConfig.Endpoints[i+1:]...)
				saveFirewallRulesLocked()
				//ensure firewall has endpoint access removed
				deleteEndpoint(a)
				//re-apply rules. the deletion may not recognize a subset that is still on
				applyFirewallRulesLocked()
				return
			}
		}
		http.Error(w, "Not found", 404)
		return
	}

	//update the existing rule  entry
	for i := range gFirewallConfig.Endpoints {
		a := gFirewallConfig.Endpoints[i]
		if endpoint.RuleName == a.RuleName {
			//delete the old endpoint
			deleteEndpoint(a)
			gFirewallConfig.Endpoints[i] = endpoint
			saveFirewallRulesLocked()
			//apply the new rules
			applyFirewallRulesLocked()
			return
		}
	}

	gFirewallConfig.Endpoints = append(gFirewallConfig.Endpoints, endpoint)
	saveFirewallRulesLocked()
	applyFirewallRulesLocked()
}

func addVerdict(IP string, Iface string, Table string) {
	err := exec.Command("nft", "add", "element", "inet", "filter", Table, "{", IP, ".", Iface, ":", "accept", "}").Run()
	if err != nil {
		log.Println("addVerdict Failed", Iface, Table, err)
		return
	}
}

func hasVerdict(IP string, Iface string, Table string) bool {
	verdict := getMapVerdict(Table)
	err := exec.Command("nft", "get", "element", "inet", "filter", Table, "{", IP, ".", Iface, ":", verdict, "}").Run()
	return err == nil
}

func addCustomDNSElement(IP, DNSCustom string) {
	err := exec.Command("nft", "add", "element", "inet", "nat", "custom_dns_devices",
		"{", IP, ":", DNSCustom, "}").Run()

	if err != nil {
		log.Println("add custom dns server failed", IP, DNSCustom, err)
	}
}

func delCustomDNSElement(IP, DNSCustom string) {
	err := exec.Command("nft", "delete", "element", "inet", "nat", "custom_dns_devices",
		"{", IP, ":", DNSCustom, "}").Run()

	if err != nil {
		log.Println("remove custom dns server failed", IP, DNSCustom, err)
	}
}

func addDNSVerdict(IP, Iface, DNSCustom string) {
	addVerdict(IP, Iface, "dns_access")

	if DNSCustom != "" {
		addCustomDNSElement(IP, DNSCustom)
	}
}

func addLANVerdict(IP string, Iface string) {
	addVerdict(IP, Iface, "lan_access")
}

func addInternetVerdict(IP string, Iface string) {
	err := exec.Command("nft", "add", "element", "inet", "filter",
		"internet_access", "{", IP, ".", Iface, ":", getMapVerdict("internet_access"), "}").Run()
	if err != nil {
		log.Println("addVerdict Failed", Iface, "internet_access", err)
		return
	}
}

func addCustomVerdict(ZoneName string, IP string, Iface string) {
	//create verdict maps if they do not exist
	err := exec.Command("nft", "list", "map", "inet", "filter", ZoneName+"_dst_access").Run()
	if err != nil {
		//two verdict maps are used for establishing custom groups.
		// the {name}_dst_access map allows Inet packets to a certain IP/interface pair
		//the {name}_src_access part allows Inet packets from a IP/IFace set

		err = exec.Command("nft", "add", "map", "inet", "filter", ZoneName+"_src_access", "{", "type", "ipv4_addr", ".", "ifname", ":", "verdict", ";", "flags", "interval", ";", "}").Run()
		if err != nil {
			log.Println("addCustomVerdict Failed", err)
			return
		}
		err = exec.Command("nft", "add", "map", "inet", "filter", ZoneName+"_dst_access", "{", "type", "ipv4_addr", ".", "ifname", ":", "verdict", ";", "flags", "interval", ";", "}").Run()
		if err != nil {
			log.Println("addCustomVerdict Failed", err)
			return
		}
		err = exec.Command("nft", "insert", "rule", "inet", "filter", "CUSTOM_GROUPS", "ip", "daddr", ".", "oifname", "vmap", "@"+ZoneName+"_dst_access", "ip", "saddr", ".", "iifname", "vmap", "@"+ZoneName+"_src_access").Run()
		if err != nil {
			log.Println("addCustomVerdict Failed", err)
			return
		}
	}

	err = exec.Command("nft", "add", "element", "inet", "filter", ZoneName+"_dst_access", "{", IP, ".", Iface, ":", "continue", "}").Run()
	if err != nil {
		log.Println("addCustomVerdict Failed", err)
		return
	}

	err = exec.Command("nft", "add", "element", "inet", "filter", ZoneName+"_src_access", "{", IP, ".", Iface, ":", "accept", "}").Run()
	if err != nil {
		log.Println("addCustomVerdict Failed", err)
		return
	}
}

func hasCustomVerdict(ZoneName string, IP string, Iface string) bool {
	err := exec.Command("nft", "get", "element", "inet", "filter", ZoneName+"_dst_access", "{", IP, ".", Iface, ":", "continue", "}").Run()
	if err == nil {
		err = exec.Command("nft", "get", "element", "inet", "filter", ZoneName+"_src_access", "{", IP, ".", Iface, ":", "accept", "}").Run()
		return err == nil
	}
	return false
}

func hasVmapEntries(devices map[string]DeviceEntry, entry DeviceEntry, Iface string) bool {
	//check if a device has its vmap entries established

	//check ethernet filter entry is present
	if entry.MAC != "" {
		if !hasVerdictMac(entry.RecentIP, entry.MAC, Iface, "ethernet_filter", "return") {
			return false
		}
	}

	//check groups
	groups := getGroupsJson()
	groupsDisabled := map[string]bool{}

	for _, group := range groups {
		groupsDisabled[group.Name] = group.Disabled
	}

	val, exists := devices[entry.MAC]

	if entry.MAC != "" {
		if !exists {
			//given a MAC that is not in the devices list. Exit
			return false
		}
	} else if entry.WGPubKey != "" {
		val, exists = devices[entry.WGPubKey]
		//wg pub key is unknown, exit
		if !exists {
			return false
		}
	}

	for _, group_name := range val.Groups {
		//skip zones that are disabled
		if groupsDisabled[group_name] {
			continue
		}

		//warn about deprecated group names
		if slices.Contains(ignore_groups, group_name) {
			log.Println("Warning, unexpected migrated group " + group_name + " for " + entry.RecentIP)
			continue
		}

		//custom group
		if !hasCustomVerdict(group_name, entry.RecentIP, Iface) {
			return false
		}
	}

	return true
}

func flushVmaps(IP string, MAC string, Ifname string, vmap_names []string, matchInterface bool) {
	is_mesh := isMeshPluginEnabled()
	mesh_downlink := ""
	if is_mesh {
		mesh_downlink = meshPluginDownlink()
	}

	//check for IP in custom dns entries, and remove from there
	entries := getCustomDNSVerdictMap()
	for _, entry := range entries {
		if entry.srcip == IP {
			delCustomDNSElement(entry.srcip, entry.dstip)
		}
	}

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

			//when in mesh mode, dont flush the downlink
			//for faster transitions
			if is_mesh && name == "ethernet_filter" {
				if entry.ifname == mesh_downlink {
					continue
				}
			}

			if Ifname == "" {
				//no ifname, cant do anything with these
			} else if (entry.ipv4 == IP) || (matchInterface && (entry.ifname == Ifname)) || ((MAC != "") && equalMAC(entry.mac, MAC)) {
				if entry.mac != "" {
					err := exec.Command("nft", "delete", "element", "inet", "filter", name, "{", entry.ipv4, ".", entry.ifname, ".", entry.mac, ":", verdict, "}").Run()
					if err != nil {
						log.Println("nft delete failed", err)
					}
				} else {
					err := exec.Command("nft", "delete", "element", "inet", "filter", name, "{", entry.ipv4, ".", entry.ifname, ":", verdict, "}").Run()
					if err != nil {
						log.Println("nft delete failed", err)
						return
					}
				}
			}
		}
	}
}

func flushRouteFromArp(MAC string) {
	arp_entry, err := GetArpEntryFromMAC(MAC)
	if err != nil {
		//relax this verbose log
		//log.Println("Arp entry not found, insufficient information to refresh", MAC)
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

func addVerdictMac(IP string, MAC string, Iface string, Table string, Verdict string) {

	if Iface == "wg0" || MAC == "" {
		return
	}

	err := exec.Command("nft", "add", "element", "inet", "filter", Table, "{", IP, ".", Iface, ".", MAC, ":", Verdict, "}").Run()
	if err != nil {
		log.Println("addVerdictMac Failed", MAC, Iface, Table, err)
		return
	}
}

func hasVerdictMac(IP string, MAC string, Iface string, Table string, Verdict string) bool {
	err := exec.Command("nft", "get", "element", "inet", "filter", Table, "{", IP, ".", Iface, ".", MAC, ":", Verdict, "}").Run()
	return err == nil
}

var blockVerdict = "goto PFWDROPLOG"
var blockVmapName = "fwd_block"

func isForwardBlockInstalled(br ForwardingBlockRule) bool {
	cmd := exec.Command("nft", "get", "element", "inet", "filter", blockVmapName, "{",
		br.SrcIP, ".", br.DstIP, ".", br.Protocol, ".", br.DstPort, ":", blockVerdict, "}")

	err := cmd.Run()
	return err == nil
}

func addForwardBlock(br ForwardingBlockRule) error {
	cmd := exec.Command("nft", "add", "element", "inet", "filter", blockVmapName, "{",
		br.SrcIP, ".", br.DstIP, ".", br.Protocol, ".", br.DstPort, ":", blockVerdict, "}")

	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to add element", err)
		log.Println(cmd)
	}
	return err
}

func deleteForwardBlock(br ForwardingBlockRule) error {
	cmd := exec.Command("nft", "delete", "element", "inet", "filter", blockVmapName, "{",
		br.SrcIP, ".", br.DstIP, ".", br.Protocol, ".", br.DstPort, ":", blockVerdict, "}")

	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to delete element", err)
		log.Println(cmd)
	}

	return err
}

func getWireguardClient() http.Client {
	c := http.Client{}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", WireguardSocketPath)
		},
	}
	return c
}

// map of wg pubkeys to time of last DHCP
var RecentDHCPWG = map[string]int64{}
var RecentDHCPIface = map[string]string{}

func notifyFirewallDHCP(device DeviceEntry, iface string) {
	addLanInterface(iface)

	if device.MAC != "" {
		RecentDHCPIface[device.MAC] = iface
	}

	if device.WGPubKey == "" {
		return
	}

	// for wireguard clients only below
	cur_time := time.Now().Unix()

	FWmtx.Lock()
	defer FWmtx.Unlock()

	RecentDHCPWG[device.WGPubKey] = cur_time
}

func getWireguardActivePeers() ([]string, []string) {
	var data map[string]interface{}
	var data2 map[string]interface{}
	var data3 map[string]interface{}
	var data4 map[string]interface{}
	var data5 []interface{}
	handshakes := []string{}
	remote_endpoints := []string{}

	req, err := http.NewRequest(http.MethodGet, "http://api-wg/status", nil)
	if err != nil {
		return handshakes, remote_endpoints
	}

	c := getWireguardClient()
	defer c.CloseIdleConnections()
	resp, err := c.Do(req)
	if err != nil {
		log.Println("wireguard request failed", err)
		return handshakes, remote_endpoints
	}

	defer resp.Body.Close()
	output, err := ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		log.Println("failed to retrieve wireguard information", resp.StatusCode)
		return handshakes, remote_endpoints
	}

	err = json.Unmarshal(output, &data)
	if err != nil {
		log.Println(err)
		return handshakes, remote_endpoints
	}

	cur_time := time.Now().Unix()

	_, exists := data["wg0"]
	if !exists {
		log.Println("Failed to retrieve wg0 from wireguard status")
		return handshakes, remote_endpoints
	}

	//iterate through peers
	data2 = data["wg0"].(map[string]interface{})
	data3 = data2["peers"].(map[string]interface{})
	for pubkey, entry := range data3 {
		data4 = entry.(map[string]interface{})
		ts := data4["latestHandshake"]
		if ts != nil {
			t := int64(ts.(float64))
			// Clients with a handshake time less than 3 minutes ago are active.
			if (cur_time - t) > (60 * 3) {
				continue
			}

			// locking for access to RecentDHCPWG
			FWmtx.Lock()
			last_dhcp := RecentDHCPWG[pubkey]
			FWmtx.Unlock()

			//dhcp was more recent, skip wireguard for this route
			if last_dhcp > t {
				continue
			}

			data5 = data4["allowedIps"].([]interface{})
			if data5 != nil && len(data5) > 0 {
				var s string = data5[0].(string)
				if s != "" {
					pieces := strings.Split(s, "/")
					handshakes = append(handshakes, pieces[0])

					//also grab the endpoint
					data6 := data4["endpoint"].(string)
					remote_endpoints = append(remote_endpoints, data6)
				}
			}

		}
	}

	return handshakes, remote_endpoints
}

var MESH_ENABLED_LEAF_PATH = TEST_PREFIX + "/state/plugins/mesh/enabled"
var MESH_SOCKET_PATH = TEST_PREFIX + "/state/plugins/mesh/socket"

func isLeafRouter() bool {
	_, err := os.Stat(MESH_ENABLED_LEAF_PATH)
	if err == nil {
		return true
	}
	return false
}

func isMeshPluginEnabled() bool {
	//tbd query config
	_, err := os.Stat(MESH_SOCKET_PATH)
	if err == nil {
		return true
	}
	return false
}

func meshPluginDownlink() string {
	//tbd this should be a paramter in mesh setup.
	//query config and get it
	return getFirstDownlink()
}

func getFirstDownlink() string {
	Interfacesmtx.Lock()
	interfacesConfig := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()

	for _, iface := range interfacesConfig {
		if iface.Enabled && iface.Type == "Downlink" {
			return iface.Name
		}
	}

	//fallback to LANIF env
	lanif := os.Getenv("LANIF")
	return lanif
}

func getWifiPeers() map[string]string {
	//TBD. Problem here. hostapd could show stations *were* connected but no longer are.
	// does the VLAN station stick around?

	peers := make(map[string]string)

	Interfacesmtx.Lock()
	interfacesConfig := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()

	updatePeers := func(iface string) {

		wifi_peers, err := RunHostapdAllStations(iface)
		if err == nil {
			for k, peer := range wifi_peers {
				val, exists := peer["vlan_id"]
				if exists && (val != "") {
					peers[k] = iface + "." + peer["vlan_id"]
				}
			}
		}

	}

	for _, entry := range interfacesConfig {
		if entry.Enabled == true && entry.Type == "AP" {
			updatePeers(entry.Name)
			if len(entry.ExtraBSS) > 0 {
				for i := range len(entry.ExtraBSS) {
					updatePeers(entry.Name + ExtraBSSPrefix + strconv.Itoa(i))
				}
			}
		}
	}

	return peers
}

func getUplinkInterface() string {
	Interfacesmtx.Lock()
	interfacesConfig := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()

	for _, entry := range interfacesConfig {
		if entry.Enabled == true && entry.Type == "Uplink" {
			return entry.Name
		}
	}

	return ""
}

type RouteEntry struct {
	Dst     string `json:"dst"`
	Dev     string `json:"dev"`
	Gateway string `json:"gateway"`
}

func getRouteInterface(IP string) string {
	routes := []RouteEntry{}

	cmd := exec.Command("ip", "-j", "route", "get", IP)
	output, err := cmd.Output()

	if err != nil {
		return ""
	}

	err = json.Unmarshal(output, &routes)
	if err != nil {
		log.Println(err)
		return ""
	}

	if len(routes) == 1 {
		return routes[0].Dev
	}

	return ""
}

func getRouteGatewayForTable(Table string) string {
	routes := []RouteEntry{}

	cmd := exec.Command("ip", "-j", "route", "show", "table", Table)
	output, err := cmd.Output()

	if err != nil {
		return ""
	}

	err = json.Unmarshal(output, &routes)
	if err != nil {
		log.Println(err)
		return ""
	}

	if len(routes) == 1 {
		return routes[0].Gateway
	}

	return ""
}

func populateVmapEntries(devices map[string]DeviceEntry, groups []GroupEntry, IP, MAC, Iface, WGPubKey, DNSCustom string) {

	groupsDisabled := map[string]bool{}
	serviceGroups := map[string][]string{}

	for _, group := range groups {
		groupsDisabled[group.Name] = group.Disabled
		if len(group.ServiceDestinations) > 0 {
			serviceGroups[group.Name] = group.ServiceDestinations
		}
	}

	val, exists := devices[MAC]

	if MAC != "" {
		if !exists {
			//given a MAC that is not in the devices list. Exit
			return
		}
	} else if WGPubKey != "" {
		val, exists = devices[WGPubKey]
		//wg pub key is unknown, exit
		if !exists {
			return
		}
	}

	//first check for the disabled policy. if so, then do not
	// apply any verdict maps
	if slices.Contains(val.Policies, "disabled") {
		return
	}

	for _, group_name := range val.Groups {
		//skip groups that are disabled
		if groupsDisabled[group_name] {
			continue
		}

		//skip service groups
		_, has_service := serviceGroups[group_name]
		if has_service {
			continue
		}

		if slices.Contains(ignore_groups, group_name) {
			log.Println("Warning, unexpected migrated group " + group_name + " for " + val.RecentIP)
			continue
		}

		addCustomVerdict(group_name, IP, Iface)
	}

	//now apply the policies

	for _, policy_name := range val.Policies {
		switch policy_name {
		case "dns":
			addDNSVerdict(IP, Iface, DNSCustom)
		case "lan":
			addLANVerdict(IP, Iface)
		case "wan":
			addInternetVerdict(IP, Iface)
		case "api":
			//tbd -> can constrain API/website access by device later.
		case "disabled":
			log.Println("Unexpected disabled here. Should have aborted earlier")
		case "lan_upstream":
			continue //handled in applyPrivateNetworkUpstreamDevice below
		case "noapi":
		case "quarantine":
		case "dns:family":
		case "guestonly":
		default:
			log.Println("Unknown policy: " + policy_name)
		}
	}

	//apply other policies
	applyPrivateNetworkUpstreamDevice(val)

	if !strings.Contains(Iface, ExtraBSSPrefix) {
		//no api was applied elsewhere.
		applyNoAPI(val)
	}

}

func stringMapsAreEqual(map1, map2 map[string]string) bool {
	if len(map1) != len(map2) {
		return false
	}

	for key, value1 := range map1 {
		value2, ok := map2[key]
		if !ok || value1 != value2 {
			return false
		}
	}
	return true
}

/*
SPR provides an up to date mapping between IP Addresses and Interfaces
in this file. This allows looking up devices by IP to get an interface name.

The multicast proxy depends on this for applying tags to broadcasts.
*/
func updateIfaceMap(ifaceMap map[string]string) {
	file, _ := json.MarshalIndent(ifaceMap, "", " ")
	err := ioutil.WriteFile(PublicIfaceMapFile, file, 0600)
	if err == nil {
		gIfaceMap = ifaceMap
	}
}

func ipIfaceMappings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gIfaceMap)
}

func setupAPInit() {
	//kick off the the firewall rules for each configured subnet
	//for the setup ap
	setup_name := false
	dhcpConfig := loadWithLockingDHCPConfig()
	for _, subnetString := range dhcpConfig.TinyNets {
		start_ip, _, _ := net.ParseCIDR(subnetString)
		router_ip := TwiddleTinyIP(start_ip, 1)
		if !setup_name {
			updateLocalMappings(router_ip.String(), "spr.setup")
			setup_name = true
		}
		exec.Command("ip", "addr", "add", router_ip.String()+"/24", "dev", SetupAP).Run()
	}

	addSetupInterface(SetupAP)

}

func updateAddr(Router string, Ifname string) {
	exec.Command("ip", "addr", "add", Router+"/30", "dev", Ifname).Run()
}

func establishDevice(devices map[string]DeviceEntry, groups []GroupEntry,
	entry DeviceEntry, new_iface, established_route_device, routeIP, router string) {

	// too noisy
	//log.Println("flushing route and vmaps ", entry.MAC, entry.RecentIP, "`", established_route_device, "`", new_iface)

	//1. delete arp entry
	if entry.MAC != "" {
		flushRouteFromArp(entry.MAC)
	}

	//2. delete this ip, mac from any existing verdict maps
	flushVmaps(entry.RecentIP, entry.MAC, new_iface, getVerdictMapNames(), isAPVlan(new_iface))

	//3. delete the old router address
	exec.Command("ip", "addr", "del", routeIP, "dev", established_route_device).Run()

	//3. Update the route interface
	exec.Command("ip", "route", "flush", routeIP).Run()

	// no interface set. abort now
	if new_iface == "" {
		return
	}

	if strings.Contains(new_iface, ExtraBSSPrefix) {
		//this was a guest wifi network, block API access
		addNoAPIAccess(entry.RecentIP)
	}

	exec.Command("ip", "route", "add", routeIP, "dev", new_iface).Run()

	// too noisy
	//log.Println("Populating route and vmaps", entry.MAC, entry.RecentIP, "`", established_route_device, "`", new_iface)

	//4. update router IP for the new interface. first delete the old addr
	updateAddr(router, new_iface)

	//5. Update the ARP entry
	if new_iface != "wg0" && entry.MAC != "" {
		updateArp(new_iface, entry.RecentIP, entry.MAC)
	}

	//6. add entry to appropriate verdict maps
	//add this MAC and IP to the ethernet filter. wg will be a no-op
	addVerdictMac(entry.RecentIP, entry.MAC, new_iface, "ethernet_filter", "return")

	Groupsmtx.Lock()
	defer Groupsmtx.Unlock()
	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	populateVmapEntries(devices, groups, entry.RecentIP, entry.MAC, new_iface, entry.WGPubKey, entry.DNSCustom)

	//apply the tags
	applyEndpointRules(entry)
}

var gPreviousVpnPeers = []string{}
var gPreviousEndpoints = []string{}

type VpnNotification struct {
	VPNType        string
	DeviceIP       string
	RemoteEndpoint string
	Status         string
}

func notifyVpnActivity(new_vpn_peers []string, endpoints []string) {
	//look for a new peer (active <3 minutes ago)
	for i, peer := range new_vpn_peers {
		//if this peer is new
		if !slices.Contains(gPreviousVpnPeers, peer) {
			notification := VpnNotification{
				VPNType:        "wireguard",
				DeviceIP:       peer,
				RemoteEndpoint: endpoints[i],
				Status:         "online",
			}
			SprbusPublish("device:vpn:online", notification)
		}
	}

	//if an old peer went away
	for i, peer := range gPreviousVpnPeers {
		if !slices.Contains(new_vpn_peers, peer) {
			notification := VpnNotification{
				VPNType:        "wireguard",
				DeviceIP:       peer,
				RemoteEndpoint: gPreviousEndpoints[i],
				Status:         "offline",
			}
			SprbusPublish("device:vpn:offline", notification)
			//recommended hardening against shadow port attacks
			//https://petsymposium.org/popets/2024/popets-2024-0070.pdf
			clearConntrackSrcIP(peer)
		}
	}

	gPreviousVpnPeers = new_vpn_peers
	gPreviousEndpoints = endpoints
}

func clearConntrackSrcIP(peer string) {
	exec.Command("conntrack", "-D", "-src="+peer).Run()
}

func dynamicRouteLoop() {
	//mesh APs do not need routes, as they use the bridge
	if isLeafRouter() {
		return
	}

	ticker := time.NewTicker(1 * time.Second)

	for {
		select {
		case <-ticker.C:

			Groupsmtx.Lock()
			groups := getGroupsJson()
			Devicesmtx.Lock()
			devices := getDevicesJson()
			checkDeviceExpiries(devices, groups)
			Devicesmtx.Unlock()
			Groupsmtx.Unlock()

			// TBD: need to handle multiple trunk ports, lan ports
			// that a device can arrive on.
			// SPR currently assumes one named LANIF.

			lanif := getFirstDownlink()
			lanif_vlan_trunk := false
			meshPluginEnabled := isMeshPluginEnabled()
			meshDownlink := ""
			if meshPluginEnabled {
				meshDownlink = meshPluginDownlink()
			}

			wireguard_peers, remote_endpoints := getWireguardActivePeers()
			wifi_peers := getWifiPeers()

			notifyVpnActivity(wireguard_peers, remote_endpoints)

			suggested_device := map[string]string{}

			Interfacesmtx.Lock()
			interfaces := loadInterfacesConfigLocked()
			Interfacesmtx.Unlock()

			for _, ifconfig := range interfaces {
				if ifconfig.Name == lanif {
					if ifconfig.Subtype == "VLAN-Trunk" {
						lanif_vlan_trunk = true
					}
				}
			}

			FWmtx.Lock()

			//if a wifi device is active, place that as priority
			for mac, iface := range wifi_peers {
				dhcp_iface, exists := RecentDHCPIface[mac]
				if !exists {
					suggested_device[mac] = iface
				} else {
					//prioritize the interface that last got a DHCP for the MAC
					suggested_device[mac] = dhcp_iface
				}

			}
			FWmtx.Unlock()

			//next, if wireguard is there, place that as priority
			// if it is not already a wifi peer
			for _, ip := range wireguard_peers {
				_, exists := suggested_device[ip]
				if !exists {
					suggested_device[ip] = "wg0"
				}
			}

			//PublicIfaceMapFile

			newIfaceMap := map[string]string{}

			//now get the existing route and make an update if needed
			for ident, entry := range devices {
				//no IP yet for this device -> no route, skip this entry
				if entry.RecentIP == "" {
					continue
				}

				// this gets the current device destination for this entry (LANIF, wifi vlan, )
				established_route_device := getRouteInterface(entry.RecentIP)

				//try the ident (MAC) first for what the new route should be
				new_iface, exists := suggested_device[ident]
				if !exists {
					// if that failed, try looking it up by IP address (for wireguard)
					new_iface, exists = suggested_device[entry.RecentIP]
				}

				//update the iface map with the designated interface
				newIfaceMap[entry.RecentIP] = new_iface

				if !exists {
					wifiDevice := isWifiDevice(entry)
					if lanif != "" && !wifiDevice {
						// when mesh plugin is off and not a wifi device, then go for lanif

						//no new_iface and a LAN interface is set, use that.
						if lanif_vlan_trunk == false || entry.VLANTag == "" {
							new_iface = lanif
						} else {
							new_iface = lanif + "." + entry.VLANTag
						}
						newIfaceMap[entry.RecentIP] = new_iface
					} else if meshPluginEnabled && wifiDevice {
						//mesh plugin was enabled and it was a wifi device
						new_iface = meshDownlink
						newIfaceMap[entry.RecentIP] = new_iface
					} else {

						// disconnected devices will have empty new_iface, skip
						continue
					}
				}

				//happy state -- the established interface matches the calculated interface to route to
				if established_route_device != "" && established_route_device == new_iface {

					device_disabled := slices.Contains(entry.Policies, "disabled")

					//investigate verdict maps and make sure device is there
					if hasVmapEntries(devices, entry, new_iface) {
						//vmaps happy, skip updating this device

						if device_disabled {
							//do flush the device
							flushVmaps(entry.RecentIP, entry.MAC, new_iface, getVerdictMapNames(), isAPVlan(new_iface))
						}
						continue
					}

				}

				//ex tinynet
				//route is 192.168.2.4
				//router is at 192.168.2.5
				//device is at 192.168.2.6
				//broadcast is at 192.168.2.7
				routeIP := TinyIpDelta(entry.RecentIP, -2)
				routerIP := TinyIpDelta(entry.RecentIP, -1)

				routeIPString := routeIP + "/30"

				establishDevice(devices, groups, entry, new_iface, established_route_device, routeIPString, routerIP)
			}

			//all devices processed, now update the iface mapping
			//newIfaceMap[entry.RecentIP] = new_iface
			if !stringMapsAreEqual(newIfaceMap, gIfaceMap) {
				updateIfaceMap(newIfaceMap)
			}

		}
	}
}

func getCurLANIP() string {
	//attempt to retrieve the current LANIP
	lanif := os.Getenv("LANIF")
	if lanif == "" {
		lanif = "sprloop"
	}

	ief, err := net.InterfaceByName(lanif)
	if err != nil {
		return ""
	}

	addrs, err := ief.Addrs()
	if err != nil {
		return ""
	}

	if len(addrs) > 0 {
		return addrs[0].(*net.IPNet).IP.String()
	}

	return ""

}

func updateFirewallSubnets(DNSIP string, TinyNets []string) {
	//update firewall table rules to service the new tiny networks, where needed
	flushSupernetworkEntries()
	for _, supernet := range TinyNets {
		addSupernetworkEntry(supernet)
	}

	//2) DNSIP
	cmd := exec.Command("nft", "flush", "chain", "inet", "nat", "DNS_DNAT")
	_, err := cmd.Output()
	if err != nil {
		log.Println("failed to flush chain", err)
		return
	}

	cmd = exec.Command("nft", "insert", "rule", "inet", "nat", "DNS_DNAT",
		"tcp", "dport", "53", "counter", "dnat", "ip", "to", DNSIP+":53")
	_, err = cmd.Output()
	if err != nil {
		log.Println("failed to insert rule", cmd, err)
	}

	cmd = exec.Command("nft", "insert", "rule", "inet", "nat", "DNS_DNAT",
		"udp", "dport", "53", "counter", "dnat", "ip", "to", DNSIP+":53")
	_, err = cmd.Output()
	if err != nil {
		log.Println("failed to insert rule", cmd, err)
	}

	cmd = exec.Command("nft", "insert", "rule", "inet", "nat", "DNS_DNAT",
		"ip", "saddr", "@custom_dns_devices", "meta", "l4proto",
		"tcp", "dnat", "to", "ip", "saddr", "map", "@custom_dns_devices:53")
	_, err = cmd.Output()
	if err != nil {
		log.Println("failed to add tcp custom_dns_devices", err)
		return
	}

	cmd = exec.Command("nft", "insert", "rule", "inet", "nat", "DNS_DNAT",
		"ip", "saddr", "@custom_dns_devices", "meta", "l4proto",
		"udp", "dnat", "to", "ip", "saddr", "map", "@custom_dns_devices:53")
	_, err = cmd.Output()
	if err != nil {
		log.Println("failed to add udp custom_dns_devices", err)
		return
	}

}

func updateSystemDNSRedirectRule(targetIP string) error {
	err := exec.Command("nft", "flush", "chain", "inet", "filter", "DNS_OUTPUT").Run()
	if err != nil {
		return fmt.Errorf("failed to flush chain: %v", err)
	}

	if targetIP != "" {
		err = exec.Command("nft", "add", "rule", "inet", "filter", "DNS_OUTPUT",
			"inet protocol { tcp, udp }", "dport 53", "ip daddr !=", targetIP, "dnat to", targetIP).Run()

		if err != nil {
			return fmt.Errorf("failed to add rule: %v", err)
		}
	}

	return nil
}

func systemDNSOverride(w http.ResponseWriter, r *http.Request) {
	FWmtx.Lock()
	defer FWmtx.Unlock()

	dns := ""
	err := json.NewDecoder(r.Body).Decode(&dns)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if dns != "" {
		ip := net.ParseIP(dns)
		if ip == nil {
			http.Error(w, "Invalid IP", 400)
			return
		}
	}

	gFirewallConfig.SystemDNSOverride = dns
	updateSystemDNSRedirectRule(gFirewallConfig.SystemDNSOverride)
	saveFirewallRulesLocked()
}

func initFirewallRules() {
	SyncBaseContainer()

	loadFirewallRules()

	FWmtx.Lock()
	defer FWmtx.Unlock()

	applyFirewallRulesLocked()

	Interfacesmtx.Lock()
	interfaces := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()

	updateSystemDNSRedirectRule(gFirewallConfig.SystemDNSOverride)

	applyRadioInterfaces(interfaces)

	refreshInterfaceOverrides()

	refreshVLANTrunks()

	refreshDownlinks()

	// dynamic route refresh
	go dynamicRouteLoop()

	// check on outbound interfaces and
	// update their routes
	go updateOutboundRoutes()

}
