package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

import (
	"github.com/gorilla/mux"
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

type FirewallConfig struct {
	ForwardingRules      []ForwardingRule
	BlockRules           []BlockRule
	ForwardingBlockRules []ForwardingBlockRule
	ServicePorts         []ServicePort
	Endpoints            []Endpoint
}

var FirewallConfigFile = TEST_PREFIX + "/configs/base/firewall.json"
var gFirewallConfig = FirewallConfig{[]ForwardingRule{}, []BlockRule{}, []ForwardingBlockRule{}, []ServicePort{}, []Endpoint{}}

var WireguardSocketPath = TEST_PREFIX + "/state/plugins/wireguard/wireguard_plugin"

var DEVICE_TAG_PERMIT_PRIVATE_UPSTREAM_ACCESS = "lan_upstream"

var BASE_READY = TEST_PREFIX + "/state/base/ready"

const firstOutboundRouteTable = 11

func SyncBaseContainer() {
	// Wait for the base container to grab the flock

	file, err := os.OpenFile(BASE_READY, os.O_RDWR|os.O_CREATE, 0644)
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
	return nil
}

// getDefaultGatewayForSubnet returns the first possible host IP for a given subnet
func getDefaultGatewayForSubnet(subnet string) string {
	// Parse the IP address and the network mask
	ip, ipnet, err := net.ParseCIDR(subnet)
	if err != nil {
		log.Printf("Unable to parse the subnet: %v", err)
		return ""
	}

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

func getDefaultGateway(dev string) (string, error) {
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
					return getDefaultGatewayForSubnet(ip4.String()), nil
				}
			}
		}
	}

	return "", nil
}

func setDefaultUplinkGateway(iface string, index int) {
	gateway, err := getDefaultGateway(iface)
	if err != nil || gateway == "" {
		//no gateway found, continue on
		return
	}
	table := fmt.Sprintf("%d", firstOutboundRouteTable+index)
	cmd := exec.Command("ip", "route", "replace", "default", "via", gateway, "dev", iface, "table", table)
	_, err = cmd.Output()
	if err != nil {
		log.Printf("Error with route setup", cmd, err)
	}

	cmd = exec.Command("ip", "route", "flush", "cache")
	_, _ = cmd.Output()
}

func updateOutboundRoutes() {
	ticker := time.NewTicker(1 * time.Second)
	for {
		select {
		case <-ticker.C:
			Interfacesmtx.Lock()
			outbound := collectOutbound()
			Interfacesmtx.Unlock()

			FWmtx.Lock()
			for i, iface := range outbound {
				//TBD check that the interface actually reaches the internet
				// if it does not, move it into a deactive state an rebuild uplink
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
		if iface.Type == "Uplink" && iface.Enabled {
			outbound = append(outbound, iface.Name)
			if len(outbound) > 255 {
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
		//dont need more, outbound will work
		return
	}

	// multiple uplink interfaces are enabled,
	// use fwmark to enable a load balancing strategy
	cmd = exec.Command("nft", strings.Fields("add rule inet mangle OUTBOUND_UPLINK 	counter meta mark set ct mark")...)
	_, err = cmd.Output()
	if err != nil {
		log.Println("failed to insert rule to OUTBOUND_UPLINK", err)
		return
	}

	cmd = exec.Command("nft", strings.Fields("add rule inet mangle OUTBOUND_UPLINK ct mark != 0x0 counter ct mark set mark")...)
	if err != nil {
		log.Println("failed to insert rule to OUTBOUND_UPLINK", err)
		return
	}

	cmdArray := strings.Fields("add rule inet mangle OUTBOUND_UPLINK ip daddr != @supernetworks ct state new counter meta mark set")
	uplinkSettings := loadUplinksConfig()

	//saddr.daddr strategy assumed by default
	strategy := []string{"jhash", "ip", "saddr", ".", "ip", "daddr"}
	if uplinkSettings.LoadBalanceStrategy == "saddr" {
		//saddr can be more consistent but has poor balancing
		strategy = []string{"jhash", "ip", "saddr"}
	}

	cmdArray = append(cmdArray, strategy...)
	cmdArray = append(cmdArray, []string{"mod", fmt.Sprintf("%d", len(outbound)), "offset", fmt.Sprintf("%d", firstOutboundRouteTable)}...)
	cmd = exec.Command("nft", cmdArray...)

	_, err = cmd.Output()
	if err != nil {
		log.Println("failed to insert rule", cmd, err)
		return
	}

	for index, outboundInterface := range outbound {
		tableNumber := firstOutboundRouteTable + index
		markNumber := tableNumber

		// Delete the existing rule, if any.
		cmd = exec.Command("ip", "rule", "del", "fwmark", fmt.Sprintf("%d", markNumber), "table", fmt.Sprintf("%d", tableNumber))
		_, _ = cmd.Output() // Ignore errors, as the rule may not exist yet.

		// Add a rule that matches the packet mark to the routing table.
		cmd = exec.Command("ip", "rule", "add", "fwmark", fmt.Sprintf("%d", markNumber), "table", fmt.Sprintf("%d", tableNumber))
		_, err = cmd.Output()
		if err != nil {
			log.Printf("failed to add rule for mark %d: %v", markNumber, err)
			continue
		}

		setDefaultUplinkGateway(outboundInterface, index)
	}

	// Flush the route cache to ensure the new route is used immediately.
	cmd = exec.Command("ip", "route", "flush", "cache")
	_, err = cmd.Output()
	if err != nil {
		log.Printf("failed to flush route cache: %v", err)
	}

}

func modifyUplinkEntry(ifname string, action string) error {
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

	rebuildUplink()
	return err
}

func addUplinkEntry(ifname string, subtype string) {
	if subtype == "pppup" {
		//ppp-up connects a ppp to the internt
		//but packets go directly through the ppp not the pppup provider
		return
	}
	modifyUplinkEntry(ifname, "add")

}
func removeUplinkEntry(ifname string) {
	modifyUplinkEntry(ifname, "delete")
}

func flushSupernetworkEntries() {
	exec.Command("nft", "flush", "set", "ip", "accounting", "local_lan").Output()
	exec.Command("nft", "flush", "set", "inet", "mangle", "supernetworks").Output()
	exec.Command("nft", "flush", "set", "ip", "filter", "supernetworks").Output()
}

func modifySupernetworkEntry(supernet string, action string) {
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
		log.Println("failed to delete element", err)
		log.Println(cmd)
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

func applyForwardBlocking(blockRules []ForwardingBlockRule) error {

	for _, br := range blockRules {
		addForwardBlock(br)
	}

	return nil
}

func deleteServicePort(port ServicePort) error {

	if port.Protocol != "tcp" {
		log.Println("[-] Error: non TCP port described, unsupported")
		return fmt.Errorf("invalid protocol for service port")
	}

	//delete port from spr_tcp_port_accept
	cmd := exec.Command("nft", "delete", "element", "inet", "filter", "spr_tcp_port_accept",
		"{", port.Port, ":", "accept", "}")
	_, err := cmd.Output()

	if err != nil {
		log.Println("failed to delete element from spr_tcp_port_accept", err)
		log.Println(cmd)
	}

	//add this disabled port  into upstream_tcp_port_drop
	cmd = exec.Command("nft", "add", "element", "inet", "filter", "upstream_tcp_port_drop",
		"{", port.Port, ":", "drop", "}")
	_, err = cmd.Output()

	if err != nil {
		log.Println("failed to add element to upstream_tcp_port_drop", err)
		log.Println(cmd)
		return err
	}

	return nil
}

func addServicePort(port ServicePort) error {
	if port.Protocol != "tcp" {
		log.Println("[-] Error: non TCP port described, unsupported")
		return fmt.Errorf("invalid protocol for service port")
	}

	//check if it exists
	cmd := exec.Command("nft", "get", "element", "inet", "filter", "upstream_tcp_port_drop",
		"{", port.Port, ":", "drop", "}")
	_, err := cmd.Output()

	drop_entry_exists := err == nil

	if port.UpstreamEnabled && drop_entry_exists {
		//remove this port from upstream_tcp_port_drop
		cmd := exec.Command("nft", "delete", "element", "inet", "filter", "upstream_tcp_port_drop",
			"{", port.Port, ":", "drop", "}")
		_, err := cmd.Output()

		if err != nil {
			log.Println("failed to delete element from upstream_tcp_port_drop", err)
			log.Println(cmd)
			return err
		}
	} else if !port.UpstreamEnabled && !drop_entry_exists {
		//add this  port into upstream_tcp_port_drop
		cmd := exec.Command("nft", "add", "element", "inet", "filter", "upstream_tcp_port_drop",
			"{", port.Port, ":", "drop", "}")
		_, err := cmd.Output()

		if err != nil {
			log.Println("failed to add element to upstream_tcp_port_drop", err)
			log.Println(cmd)
			return err
		}
	}

	cmd = exec.Command("nft", "get", "element", "inet", "filter", "spr_tcp_port_accept",
		"{", port.Port, ":", "accept", "}")
	_, err = cmd.Output()

	if err != nil {
		//entry did not already exist, add it.

		//add port to spr_tcp_port_accept for LAN to reach and WAN if UpstreamEnabled
		cmd := exec.Command("nft", "add", "element", "inet", "filter", "spr_tcp_port_accept",
			"{", port.Port, ":", "accept", "}")
		_, err := cmd.Output()

		if err != nil {
			log.Println("failed to add element to spr_tcp_port_accept", err)
			log.Println(cmd)
			return err
		}
	}

	return nil
}

func applyServicePorts(servicePorts []ServicePort) error {

	for _, port := range servicePorts {
		addServicePort(port)
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

	foundTag := false
	for _, tag := range device.DeviceTags {
		if tag == DEVICE_TAG_PERMIT_PRIVATE_UPSTREAM_ACCESS {
			foundTag = true
			break
		}
	}

	inUpstreamAllowed := hasPrivateUpstreamAccess(IP)

	if foundTag && !inUpstreamAllowed {
		//if has the tag but not in the verdict map, add it
		allowPrivateUpstreamAccess(IP)
	} else if !foundTag && inUpstreamAllowed {
		//if in the verdict map but does not have the tag, remove it
		removePrivateUpstreamAccess(IP)
	}
}

func applyBuiltinTagFirewallRules() {
	Devicesmtx.Lock()
	devices := getDevicesJson()
	Devicesmtx.Unlock()

	for _, device := range devices {
		applyPrivateNetworkUpstreamDevice(device)
		applyEndpointRules(device)
	}
}

func populateSets() {
	//dhcp config loading already handles supernetworks mana
	Interfacesmtx.Lock()
	interfaces := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()

	for _, iface := range interfaces {
		if iface.Type == "Uplink" && iface.Enabled == true {
			addUplinkEntry(iface.Name, iface.Subtype)
		}
	}
}

func applyFirewallRulesLocked() {

	populateSets()

	applyForwarding(gFirewallConfig.ForwardingRules)

	applyBlocking(gFirewallConfig.BlockRules)

	applyForwardBlocking(gFirewallConfig.ForwardingBlockRules)

	applyServicePorts(gFirewallConfig.ServicePorts)

	applyBuiltinTagFirewallRules()
}

func applyRadioInterfaces(interfacesConfig []InterfaceConfig) {
	cmd := exec.Command("nft", "flush", "chain", "inet", "filter", "WIPHY_MACSPOOF_CHECK")
	_, err := cmd.Output()
	if err != nil {
		log.Println("failed to flush chain", err)
		return
	}

	cmd = exec.Command("nft", "flush", "chain", "inet", "filter", "WIPHY_FORWARD_LAN")
	_, err = cmd.Output()
	if err != nil {
		log.Println("failed to flush chain", err)
		return
	}

	for _, entry := range interfacesConfig {
		if entry.Enabled == true && entry.Type == "AP" {
			//#    $(if [ "$VLANSIF" ]; then echo "counter iifname eq "$VLANSIF*" jump DROP_MAC_SPOOF"; fi)
			cmd = exec.Command("nft", "insert", "rule", "inet", "filter", "WIPHY_MACSPOOF_CHECK",
				"counter", "iifname", "eq", entry.Name+".*", "jump", "DROP_MAC_SPOOF")
			_, err = cmd.Output()
			if err != nil {
				log.Println("failed to insert rule", cmd, err)
			}

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

	re := regexp.MustCompile("^([0-9].*-[0-9].*|[0-9]*)$")

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

	//only TCP supported for now
	if port.Protocol != "tcp" {
		http.Error(w, "Invalid protocol, only tcp supported currently", 400)
		return
	}

	re := regexp.MustCompile("^([0-9].*)$")

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

		re := regexp.MustCompile("^([0-9].*)$")

		if endpoint.Port != "any" && (endpoint.Port == "" || !re.MatchString(endpoint.Port)) {
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

func addDNSVerdict(IP string, Iface string) {
	addVerdict(IP, Iface, "dns_access")
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

		err = exec.Command("nft", "add", "map", "inet", "filter", ZoneName+"_src_access", "{", "type", "ipv4_addr", ".", "ifname", ":", "verdict", ";", "}").Run()
		if err != nil {
			log.Println("addCustomVerdict Failed", err)
			return
		}
		err = exec.Command("nft", "add", "map", "inet", "filter", ZoneName+"_dst_access", "{", "type", "ipv4_addr", ".", "ifname", ":", "verdict", ";", "}").Run()
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
	if !hasVerdictMac(entry.RecentIP, entry.MAC, Iface, "ethernet_filter", "return") {
		return false
	}

	//check groups
	zones := getGroupsJson()
	zonesDisabled := map[string]bool{}

	for _, zone := range zones {
		zonesDisabled[zone.Name] = zone.Disabled
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

	for _, zone_name := range val.Groups {
		//skip zones that are disabled
		if zonesDisabled[zone_name] {
			continue
		}
		switch zone_name {
		case "isolated":
			continue
		case "dns":
			if !hasVerdict(entry.RecentIP, Iface, "dns_access") {
				return false
			}
		case "lan":
			if !hasVerdict(entry.RecentIP, Iface, "lan_access") {
				return false
			}
		case "wan":
			if !hasVerdict(entry.RecentIP, Iface, "internet_access") {
				return false
			}
		default:
			//custom group
			if !hasCustomVerdict(zone_name, entry.RecentIP, Iface) {
				return false
			}
		}
	}

	return true
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

func addVerdictMac(IP string, MAC string, Iface string, Table string, Verdict string) {
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
	if device.WGPubKey == "" {
		return
	}

	cur_time := time.Now().Unix()

	FWmtx.Lock()
	defer FWmtx.Unlock()

	RecentDHCPWG[device.WGPubKey] = cur_time
	if device.MAC != "" {
		RecentDHCPIface[device.MAC] = iface
	}
}

func getWireguardActivePeers() []string {
	var data map[string]interface{}
	var data2 map[string]interface{}
	var data3 map[string]interface{}
	var data4 map[string]interface{}
	var data5 []interface{}
	handshakes := []string{}

	req, err := http.NewRequest(http.MethodGet, "http://api-wg/status", nil)
	if err != nil {
		return handshakes
	}

	c := getWireguardClient()
	defer c.CloseIdleConnections()
	resp, err := c.Do(req)
	if err != nil {
		log.Println("wireguard request failed", err)
		return handshakes
	}

	defer resp.Body.Close()
	output, err := ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		log.Println("failed to retrieve wireguard information", resp.StatusCode)
		return handshakes
	}

	err = json.Unmarshal(output, &data)
	if err != nil {
		log.Println(err)
		return handshakes
	}

	cur_time := time.Now().Unix()

	_, exists := data["wg0"]
	if !exists {
		log.Println("Failed to retrieve wg0 from wireguard status")
		return handshakes
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
				}
			}
		}
	}

	return handshakes
}

var MESH_ENABLED_LEAF_PATH = TEST_PREFIX + "/state/plugins/mesh/enabled"

func isLeafRouter() bool {
	_, err := os.Stat(MESH_ENABLED_LEAF_PATH)
	if err == nil {
		return true
	}
	return false
}

func getWifiPeers() map[string]string {
	//TBD. Problem here. hostapd could show stations *were* connected but no longer are.
	// does the VLAN station stick around?

	peers := make(map[string]string)

	Interfacesmtx.Lock()
	interfacesConfig := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()

	for _, entry := range interfacesConfig {
		if entry.Enabled == true && entry.Type == "AP" {
			wifi_peers, err := RunHostapdAllStations(entry.Name)
			if err == nil {
				for k, peer := range wifi_peers {
					val, exists := peer["vlan_id"]
					if exists && (val != "") {
						peers[k] = entry.Name + "." + peer["vlan_id"]
					}
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
	Dst string `json:"dst"`
	Dev string `json:"dev"`
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

func populateVmapEntries(IP string, MAC string, Iface string, WGPubKey string) {
	zones := getGroupsJson()
	zonesDisabled := map[string]bool{}
	serviceZones := map[string][]string{}

	for _, zone := range zones {
		zonesDisabled[zone.Name] = zone.Disabled
		if len(zone.ServiceDestinations) > 0 {
			serviceZones[zone.Name] = zone.ServiceDestinations
		}
	}

	devices := getDevicesJson()
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

	for _, zone_name := range val.Groups {
		//skip zones that are disabled
		if zonesDisabled[zone_name] {
			continue
		}
		//skip service zones
		_, has_service := serviceZones[zone_name]
		if has_service {
			continue
		}

		switch zone_name {
		case "isolated":
			continue
		case "dns":
			addDNSVerdict(IP, Iface)
		case "lan":
			addLANVerdict(IP, Iface)
		case "wan":
			addInternetVerdict(IP, Iface)
		default:
			//custom group
			addCustomVerdict(zone_name, IP, Iface)
		}
	}

}

func establishDevice(entry DeviceEntry, new_iface string, established_route_device string, routeIP string, router string) {

	log.Println("flushing route and vmaps ", entry.MAC, entry.RecentIP, "`", established_route_device, "`", new_iface)

	//1. delete arp entry
	flushRoute(entry.MAC)

	//2. delete this ip, mac from any existing verdict maps
	flushVmaps(entry.RecentIP, entry.MAC, new_iface, getVerdictMapNames(), isAPVlan(new_iface))

	//3. delete the old router address
	exec.Command("ip", "addr", "del", routeIP, "dev", established_route_device).Run()

	//3. Update the route interface
	exec.Command("ip", "route", "flush", routeIP).Run()
	exec.Command("ip", "route", "add", routeIP, "dev", new_iface).Run()

	log.Println("Populating route and vmaps", entry.MAC, entry.RecentIP, "`", established_route_device, "`", new_iface)

	//4. update router IP for the new interface. first delete the old addr
	updateAddr(router, new_iface)

	//5. Update the ARP entry
	if new_iface != "wg0" {
		updateArp(new_iface, entry.RecentIP, entry.MAC)
	}

	//6. add entry to appropriate verdict maps
	if new_iface != "wg0" {
		//add this MAC and IP to the ethernet filter
		addVerdictMac(entry.RecentIP, entry.MAC, new_iface, "ethernet_filter", "return")
	}

	Devicesmtx.Lock()
	defer Devicesmtx.Unlock()

	populateVmapEntries(entry.RecentIP, entry.MAC, new_iface, entry.WGPubKey)

	//apply the tags
	applyPrivateNetworkUpstreamDevice(entry)
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

			Devicesmtx.Lock()
			devices := getDevicesJson()
			Devicesmtx.Unlock()

			lanif := os.Getenv("LANIF")

			wireguard_peers := getWireguardActivePeers()
			wifi_peers := getWifiPeers()

			suggested_device := map[string]string{}

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

				if !exists {
					if lanif != "" {
						//no new_iface and a LAN interface is set, use that.
						//TBD: VLAN here based on the assigned vlan id
						new_iface = lanif
					} else {
						// disconnected devices will have empty new_iface, skip
						continue
					}
				}

				//happy state -- the established interface matches the calculated interface to route to
				if established_route_device != "" && established_route_device == new_iface {

					//investigate verdict maps and make sure device is there
					if hasVmapEntries(devices, entry, new_iface) {
						//vmaps happy, skip updating this device
						continue
					}

					log.Println("[-] Missing vmap entries for mac=", ident, "new_iface=", new_iface)
				}

				//ex tinynet
				//route is 192.168.2.4
				//router is at 192.168.2.5
				//device is at 192.168.2.6
				//broadcast is at 192.168.2.7
				routeIP := TinyIpDelta(entry.RecentIP, -2)
				routerIP := TinyIpDelta(entry.RecentIP, -1)

				routeIPString := routeIP + "/30"

				establishDevice(entry, new_iface, established_route_device, routeIPString, routerIP)
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

	//#    $(if [ "$VLANSIF" ]; then echo "counter iifname eq "$VLANSIF*" jump DROP_MAC_SPOOF"; fi)
	cmd = exec.Command("nft", "insert", "rule", "inet", "nat", "DNS_DNAT",
		"udp", "dport", "53", "counter", "dnat", "ip", "to", DNSIP+":53")
	_, err = cmd.Output()
	if err != nil {
		log.Println("failed to insert rule", cmd, err)
	}

	cmd = exec.Command("nft", "insert", "rule", "inet", "nat", "DNS_DNAT",
		"tcp", "dport", "53", "counter", "dnat", "ip", "to", DNSIP+":53")
	_, err = cmd.Output()
	if err != nil {
		log.Println("failed to insert rule", cmd, err)
	}

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

	applyRadioInterfaces(interfaces)

	// dynamic route refresh
	go dynamicRouteLoop()

	// check on outbound interfaces and
	// update their routes
	go updateOutboundRoutes()

}
