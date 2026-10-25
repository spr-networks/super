package main

// Plugin networks, as Docker's bridge driver with "iptables": false (the
// SPR firewall filters and routes plugin interfaces): a Linux bridge per
// compose network, named by com.docker.network.bridge.name, and a veth from
// it into each container's network namespace. Addresses come from Docker's
// default pool, 172.17-31.0.0/16, gateway .1 on the bridge unless
// com.docker.network.bridge.inhibit_ipv4 is set.

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

const (
	bridgeNameOpt  = "com.docker.network.bridge.name"
	inhibitIPv4Opt = "com.docker.network.bridge.inhibit_ipv4"
)

type Network struct {
	Name    string
	ID      string
	Project string
	Bridge  string
	Subnet  string
	Gateway string
	Inhibit bool
	Options map[string]string
	// container id -> its address on this network
	Endpoints map[string]Endpoint
}

type Endpoint struct {
	Name string
	IP   string
	MAC  string
}

// Attachment is one container interface, set up by `superd prepare`.
type Attachment struct {
	Network string
	Bridge  string
	Ifname  string
	IP      string // address/prefix
	Gateway string
	MAC     string
	Inhibit bool
	// the default route goes through the first attachment
	DefaultRoute bool
}

var networkMtx sync.Mutex

func networksPath() string { return filepath.Join(PluginRoot, "networks.json") }

func loadNetworks() map[string]*Network {
	networks := map[string]*Network{}
	data, err := os.ReadFile(networksPath())
	if err == nil {
		json.Unmarshal(data, &networks)
	}
	return networks
}

func saveNetworks(networks map[string]*Network) error {
	data, _ := json.MarshalIndent(networks, "", "  ")
	return writeFileAtomic(networksPath(), data, 0644)
}

func networkID(name string) string {
	sum := sha256.Sum256([]byte("spr-plugin-network\x00" + name))
	return hex.EncodeToString(sum[:])
}

func defaultBridgeName(name string) string {
	return "br-" + networkID(name)[:12]
}

// ensureNetwork records a compose network, allocating its subnet.
func ensureNetwork(networks map[string]*Network, name, project string, options map[string]string, subnet, gateway string) (*Network, error) {
	if n, ok := networks[name]; ok {
		return n, nil
	}
	bridge := options[bridgeNameOpt]
	if bridge == "" {
		bridge = defaultBridgeName(name)
	}
	if !validIfname(bridge) {
		return nil, fmt.Errorf("invalid bridge name %q for network %s", bridge, name)
	}
	for _, other := range networks {
		if other.Bridge == bridge {
			return nil, fmt.Errorf("network %s conflicts with network %s: networks have same bridge name", name, other.Name)
		}
	}

	if subnet == "" {
		var err error
		if subnet, err = allocateSubnet(networks); err != nil {
			return nil, err
		}
	}
	_, ipnet, err := net.ParseCIDR(subnet)
	if err != nil || ipnet.IP.To4() == nil {
		return nil, fmt.Errorf("invalid subnet %q for network %s", subnet, name)
	}
	// an explicit subnet must not take over a host or plugin route
	for _, used := range usedSubnets(networks, bridge) {
		if overlaps(ipnet, used) {
			return nil, fmt.Errorf("subnet %s for network %s overlaps %s on the host", ipnet, name, used)
		}
	}
	if gateway == "" {
		gateway = nthIP(ipnet, 1).String()
	}
	prefix, bits := ipnet.Mask.Size()
	gw := net.ParseIP(gateway).To4()
	if gw == nil || !ipnet.Contains(gw) || gw.Equal(ipnet.IP) || gw.Equal(nthIP(ipnet, uint32(1)<<(bits-prefix)-1)) {
		return nil, fmt.Errorf("invalid gateway %q for network %s", gateway, name)
	}
	gateway = gw.String()
	// a host interface is never adopted: only a bridge left over from a
	// plugin network (no addresses but this network's gateway) is reused,
	// and compose down deletes it
	if linkExists(bridge) && !staleBridge(bridge, fmt.Sprintf("%s/%d", gateway, prefix)) {
		return nil, fmt.Errorf("bridge name %q for network %s is an existing host interface", bridge, name)
	}

	n := &Network{
		Name:      name,
		ID:        networkID(name),
		Project:   project,
		Bridge:    bridge,
		Subnet:    ipnet.String(),
		Gateway:   gateway,
		Inhibit:   options[inhibitIPv4Opt] == "true",
		Options:   options,
		Endpoints: map[string]Endpoint{},
	}
	networks[name] = n
	return n, nil
}

func validIfname(name string) bool {
	if name == "" || len(name) > 15 {
		return false
	}
	for _, c := range name {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '-' || c == '_' || c == '.') {
			return false
		}
	}
	return true
}

func nthIP(ipnet *net.IPNet, n uint32) net.IP {
	ip := ipnet.IP.To4()
	v := uint32(ip[0])<<24 | uint32(ip[1])<<16 | uint32(ip[2])<<8 | uint32(ip[3])
	v += n
	return net.IPv4(byte(v>>24), byte(v>>16), byte(v>>8), byte(v))
}

// staleBridge reports whether link is a bridge with no IPv4 address but
// gateway (address/prefix): what a plugin network leaves behind.
func staleBridge(link, gateway string) bool {
	out, err := exec.Command("ip", "-j", "-d", "link", "show", "dev", link).Output()
	if err != nil {
		return false
	}
	links := []struct {
		Linkinfo struct {
			InfoKind string `json:"info_kind"`
		}
	}{}
	if json.Unmarshal(out, &links) != nil || len(links) != 1 || links[0].Linkinfo.InfoKind != "bridge" {
		return false
	}
	// a link without IPv4 addresses is left out of this output
	out, err = exec.Command("ip", "-j", "-4", "addr", "show", "dev", link).Output()
	if err != nil {
		return false
	}
	addrs := []struct {
		AddrInfo []struct {
			Local     string
			Prefixlen int
		} `json:"addr_info"`
	}{}
	if len(strings.TrimSpace(string(out))) > 0 && json.Unmarshal(out, &addrs) != nil {
		return false
	}
	for _, l := range addrs {
		for _, a := range l.AddrInfo {
			if fmt.Sprintf("%s/%d", a.Local, a.Prefixlen) != gateway {
				return false
			}
		}
	}
	return true
}

// the subnets in use: the host's routes (except those on bridge, a stale
// bridge of this network) and the other plugin networks
func usedSubnets(networks map[string]*Network, bridge string) []*net.IPNet {
	used := hostSubnets(bridge)
	for _, n := range networks {
		if _, ipnet, err := net.ParseCIDR(n.Subnet); err == nil {
			used = append(used, ipnet)
		}
	}
	return used
}

// the subnets on the host already: its addresses and routes, except those
// on exceptDev
func hostSubnets(exceptDev string) []*net.IPNet {
	subnets := []*net.IPNet{}
	out, err := exec.Command("ip", "-j", "-4", "route", "show", "table", "all").Output()
	if err == nil {
		routes := []struct{ Dst, Dev string }{}
		json.Unmarshal(out, &routes)
		for _, r := range routes {
			if r.Dst == "" || r.Dst == "default" || (exceptDev != "" && r.Dev == exceptDev) {
				continue
			}
			if !strings.Contains(r.Dst, "/") {
				r.Dst += "/32"
			}
			if _, n, err := net.ParseCIDR(r.Dst); err == nil {
				subnets = append(subnets, n)
			}
		}
	}
	return subnets
}

func overlaps(a, b *net.IPNet) bool {
	return a.Contains(b.IP) || b.Contains(a.IP)
}

func allocateSubnet(networks map[string]*Network) (string, error) {
	used := usedSubnets(networks, "")
	for second := 17; second <= 31; second++ {
		_, candidate, _ := net.ParseCIDR(fmt.Sprintf("172.%d.0.0/16", second))
		free := true
		for _, u := range used {
			if overlaps(candidate, u) {
				free = false
				break
			}
		}
		if free {
			return candidate.String(), nil
		}
	}
	return "", fmt.Errorf("no free subnet in 172.17.0.0-172.31.255.255 for a plugin network")
}

// attach gives container id an address on network n, keeping one it has.
func attach(n *Network, id, containerName, ipv4, mac string) (Endpoint, error) {
	if e, ok := n.Endpoints[id]; ok && (ipv4 == "" || strings.HasPrefix(e.IP, ipv4+"/")) && (mac == "" || e.MAC == mac) {
		return e, nil
	}
	_, ipnet, _ := net.ParseCIDR(n.Subnet)
	prefix, _ := ipnet.Mask.Size()
	taken := map[string]bool{n.Gateway: true}
	for other, e := range n.Endpoints {
		if other != id {
			taken[strings.SplitN(e.IP, "/", 2)[0]] = true
		}
	}

	ip := net.ParseIP(ipv4)
	if ipv4 != "" && (ip == nil || !ipnet.Contains(ip) || taken[ip.String()]) {
		return Endpoint{}, fmt.Errorf("address %s is not available on network %s", ipv4, n.Name)
	}
	if ip == nil {
		size := uint32(1) << (32 - prefix)
		for i := uint32(2); i < size-1; i++ {
			candidate := nthIP(ipnet, i)
			if !taken[candidate.String()] {
				ip = candidate
				break
			}
		}
		if ip == nil {
			return Endpoint{}, fmt.Errorf("network %s has no free addresses", n.Name)
		}
	}
	if mac == "" {
		// as Docker: 02:42 and the IPv4 address
		v4 := ip.To4()
		mac = fmt.Sprintf("02:42:%02x:%02x:%02x:%02x", v4[0], v4[1], v4[2], v4[3])
	}
	e := Endpoint{Name: containerName, IP: fmt.Sprintf("%s/%d", ip, prefix), MAC: mac}
	n.Endpoints[id] = e
	return e, nil
}

func detach(networks map[string]*Network, id string) {
	for _, n := range networks {
		delete(n.Endpoints, id)
	}
}

// removeUnusedNetworks deletes a project's networks no container is
// attached to, as compose down does.
func removeUnusedNetworks(networks map[string]*Network, project string) {
	for name, n := range networks {
		if n.Project == project && len(n.Endpoints) == 0 {
			run("ip", "link", "del", n.Bridge)
			delete(networks, name)
		}
	}
}

func run(args ...string) error {
	out, err := exec.Command(args[0], args[1:]...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %v: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return nil
}

func linkExists(name string) bool {
	_, err := net.InterfaceByName(name)
	return err == nil
}

// ensureBridge creates network n's bridge, with the gateway address unless
// IPv4 is inhibited. The API secures a plugin's bridge before it starts the
// plugin, so bridges exist from the pull on, as Docker networks do.
func ensureBridge(n *Network) error {
	if !linkExists(n.Bridge) {
		if err := run("ip", "link", "add", "name", n.Bridge, "type", "bridge"); err != nil && !linkExists(n.Bridge) {
			return err
		}
	}
	if !n.Inhibit && n.Gateway != "" {
		_, ipnet, err := net.ParseCIDR(n.Subnet)
		if err != nil {
			return err
		}
		prefix, _ := ipnet.Mask.Size()
		gw := fmt.Sprintf("%s/%d", n.Gateway, prefix)
		out, _ := exec.Command("ip", "-4", "-o", "addr", "show", "dev", n.Bridge).Output()
		if !strings.Contains(string(out), " "+gw+" ") {
			if err := run("ip", "addr", "add", gw, "dev", n.Bridge); err != nil {
				return err
			}
		}
	}
	return run("ip", "link", "set", n.Bridge, "up")
}

// ensureBridges brings up every known network's bridge (at superd start:
// they are gone after a reboot).
func ensureBridges() {
	networkMtx.Lock()
	networks := loadNetworks()
	networkMtx.Unlock()
	for _, n := range networks {
		if err := ensureBridge(n); err != nil {
			fmt.Println("network " + n.Name + ": " + err.Error())
		}
	}
}

func vethName(id string, index int) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s\x00%d", id, index)))
	return "veth" + hex.EncodeToString(sum[:])[:11]
}

// netUp creates container id's network namespace and its interfaces.
func netUp(id string, attachments []Attachment) error {
	netDown(id)
	if err := run("ip", "netns", "add", id); err != nil {
		return err
	}
	if err := run("ip", "-n", id, "link", "set", "lo", "up"); err != nil {
		return err
	}
	networkMtx.Lock()
	networks := loadNetworks()
	networkMtx.Unlock()
	for i, a := range attachments {
		n, ok := networks[a.Network]
		if !ok {
			return fmt.Errorf("network %s is gone: start the plugin again", a.Network)
		}
		if err := ensureBridge(n); err != nil {
			return err
		}
		host := vethName(id, i)
		peer := "p" + host[1:]
		// the previous run's namespace can outlive `ip netns del` briefly
		if linkExists(host) {
			run("ip", "link", "del", host)
		}
		steps := [][]string{
			{"ip", "link", "add", host, "type", "veth", "peer", "name", peer, "netns", id},
			{"ip", "link", "set", host, "master", a.Bridge},
			{"ip", "link", "set", host, "up"},
			{"ip", "-n", id, "link", "set", peer, "name", a.Ifname},
			{"ip", "-n", id, "link", "set", a.Ifname, "address", a.MAC},
			{"ip", "-n", id, "addr", "add", a.IP, "dev", a.Ifname},
			{"ip", "-n", id, "link", "set", a.Ifname, "up"},
		}
		if a.DefaultRoute && !a.Inhibit {
			steps = append(steps, []string{"ip", "-n", id, "route", "add", "default", "via", a.Gateway})
		}
		for _, step := range steps {
			if err := run(step...); err != nil {
				return err
			}
		}
	}
	return nil
}

// netDown removes the namespace, which deletes its veth pairs.
func netDown(id string) {
	if _, err := os.Stat(filepath.Join("/run/netns", id)); err == nil {
		run("ip", "netns", "del", id)
	}
}

// Docker API network objects, for the API and UI (docker_info)
type dockerNetwork struct {
	Name       string
	Id         string
	Driver     string
	Scope      string
	Options    map[string]string
	IPAM       dockerIPAM
	Containers map[string]dockerNetworkEndpoint
	Labels     map[string]string
}

type dockerIPAM struct {
	Driver string
	Config []map[string]string
}

type dockerNetworkEndpoint struct {
	Name        string
	MacAddress  string
	IPv4Address string
	IPv6Address string
}

func dockerNetworks() []dockerNetwork {
	networkMtx.Lock()
	networks := loadNetworks()
	networkMtx.Unlock()

	list := []dockerNetwork{{
		Name: "host", Id: networkID("host"), Driver: "host", Scope: "local",
		Options: map[string]string{}, IPAM: dockerIPAM{Driver: "default", Config: []map[string]string{}},
		Containers: map[string]dockerNetworkEndpoint{}, Labels: map[string]string{},
	}}
	names := []string{}
	for name := range networks {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		n := networks[name]
		options := map[string]string{}
		for k, v := range n.Options {
			options[k] = v
		}
		options[bridgeNameOpt] = n.Bridge
		d := dockerNetwork{
			Name: n.Name, Id: n.ID, Driver: "bridge", Scope: "local", Options: options,
			IPAM:       dockerIPAM{Driver: "default", Config: []map[string]string{{"Subnet": n.Subnet, "Gateway": n.Gateway}}},
			Containers: map[string]dockerNetworkEndpoint{},
			Labels:     map[string]string{"com.docker.compose.project": n.Project},
		}
		for id, e := range n.Endpoints {
			if unitActive(id) {
				d.Containers[id] = dockerNetworkEndpoint{Name: e.Name, MacAddress: e.MAC, IPv4Address: e.IP}
			}
		}
		list = append(list, d)
	}
	return list
}
