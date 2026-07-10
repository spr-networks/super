package main

import (
	"encoding/json"
	"net"
	"net/http"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type StationSignal struct {
	RSSI   int
	TxRate int
	RxRate int
	Caps   []string `json:",omitempty"` // HT | VHT | HE | EHT
}

type RadioInfo struct {
	Channel  int
	Freq     int
	Modes    []string `json:",omitempty"` // 802.11 n | ac | ax | be
	Stations int
}

type TopoNode struct {
	ID       string
	Kind     string // router | uplink | ap_radio | port | vpn | device | leaf_router | endpoint | extension
	Name     string
	MAC      string         `json:",omitempty"`
	IP       string         `json:",omitempty"`
	TinyNet  string         `json:",omitempty"`
	VLANTag  string         `json:",omitempty"`
	ConnType string         `json:",omitempty"` // wifi | wired | wireguard | offline
	Iface    string         `json:",omitempty"`
	SSID     string         `json:",omitempty"`
	Radio    *RadioInfo     `json:",omitempty"`
	Groups   []string       `json:",omitempty"`
	Policies []string       `json:",omitempty"`
	Tags     []string       `json:",omitempty"`
	Signal   *StationSignal `json:",omitempty"`
	Online   bool
	Isolated bool `json:",omitempty"`
	Style    DeviceStyle

	DHCPFirstTime string `json:",omitempty"`
	DHCPLastTime  string `json:",omitempty"`
}

type TopoEdge struct {
	From   string
	To     string
	Layer  string  // l1 | policy
	Kind   string  // wifi | wired | wg | uplink | group:<name> | policy:<name> | endpoint:<name>
	Metric float64 `json:",omitempty"`
	Bidir  bool    `json:",omitempty"` // policy edges: From can initiate to To; Bidir means both ways
}

type Topology struct {
	GeneratedAt time.Time
	Nodes       []TopoNode
	Edges       []TopoEdge
	Sinks       []TopoSink `json:",omitempty"`
}

// a routeable egress advertised by a plugin: outbound traffic can be sent
// out Iface (optionally via IP) with a pfw ForwardingRule.DstInterface
type TopoSink struct {
	ID     string
	Name   string
	Iface  string
	IP     string `json:",omitempty"`
	Online bool
}

type wifiStation struct {
	Iface   string
	Station map[string]string
}

func deviceNodeID(dev DeviceEntry) string {
	if dev.MAC != "" {
		return "dev:" + strings.ToLower(dev.MAC)
	}
	if dev.WGPubKey != "" {
		return "dev:" + dev.WGPubKey
	}
	return ""
}

func tinyNetFromIP(IP string) string {
	_, subnet, err := net.ParseCIDR(IP + "/30")
	if err != nil {
		return ""
	}
	return subnet.String()
}

func stationInt(station map[string]string, key string) int {
	fields := strings.Fields(station[key])
	if len(fields) == 0 {
		return 0
	}
	value, _ := strconv.Atoi(fields[0])
	return value
}

func getTopologyWifiStations(interfaces []InterfaceConfig) map[string]wifiStation {
	stations := map[string]wifiStation{}

	collect := func(iface string) {
		wifi_peers, err := RunHostapdAllStations(iface)
		if err == nil {
			for mac, station := range wifi_peers {
				stations[strings.ToLower(mac)] = wifiStation{iface, station}
			}
		}
	}

	for _, entry := range interfaces {
		if entry.Enabled == true && entry.Type == "AP" {
			collect(entry.Name)
			for i := range len(entry.ExtraBSS) {
				collect(entry.Name + ExtraBSSPrefix + strconv.Itoa(i))
			}
		}
	}

	return stations
}

func getAPStatus(interfaces []InterfaceConfig) map[string]map[string]string {
	apStatus := map[string]map[string]string{}
	for _, entry := range interfaces {
		if entry.Enabled == true && entry.Type == "AP" {
			status, err := RunHostapdStatus(entry.Name)
			if err == nil {
				apStatus[entry.Name] = status
			}
		}
	}
	return apStatus
}

func radioInfoFromStatus(status map[string]string) *RadioInfo {
	if status == nil {
		return nil
	}

	atoi := func(key string) int {
		value, _ := strconv.Atoi(status[key])
		return value
	}

	modes := []string{}
	for _, mode := range []string{"n", "ac", "ax", "be"} {
		if status["ieee80211"+mode] == "1" {
			modes = append(modes, mode)
		}
	}

	return &RadioInfo{
		Channel:  atoi("channel"),
		Freq:     atoi("freq"),
		Modes:    modes,
		Stations: atoi("num_sta[0]"),
	}
}

func stationCaps(station map[string]string) []string {
	caps := []string{}
	for _, cap := range []string{"HT", "VHT", "HE", "EHT"} {
		if strings.Contains(station["flags"], "["+cap+"]") {
			caps = append(caps, cap)
		}
	}
	return caps
}

// presence via nft accounting: an IP whose counters moved within the window is active.
// ARP can't tell us this — SPR seeds permanent entries, so they never reflect liveness.
func getRecentlyActiveIPs(minutes int) map[string]bool {
	active := map[string]bool{}
	history := gTrafficHistory
	if len(history) == 0 {
		return active
	}
	if minutes >= len(history) {
		minutes = len(history) - 1
	}

	latest := history[0]
	if minutes < 1 {
		for ip := range latest {
			active[ip] = true
		}
		return active
	}

	baseline := history[minutes]
	for ip, count := range latest {
		prev, exists := baseline[ip]
		if !exists || count.LanIn != prev.LanIn || count.LanOut != prev.LanOut ||
			count.WanIn != prev.WanIn || count.WanOut != prev.WanOut {
			active[ip] = true
		}
	}
	return active
}

func isTopologyIsolated(dev DeviceEntry) bool {
	return dev.DeviceDisabled ||
		slices.Contains(dev.Policies, "quarantine") ||
		slices.Contains(dev.Policies, "disabled")
}

func devicePolicyEdges(devices map[string]DeviceEntry, uplinkID string) []TopoEdge {
	edges := []TopoEdge{}
	members := map[string][]string{}
	lanInitiators := []string{}
	lanSet := map[string]bool{}
	allIDs := []string{}

	for _, dev := range devices {
		id := deviceNodeID(dev)
		if id == "" || isTopologyIsolated(dev) {
			continue
		}

		allIDs = append(allIDs, id)
		for _, group := range dev.Groups {
			members["group:"+group] = append(members["group:"+group], id)
		}
		if slices.Contains(dev.Policies, "lan") {
			lanInitiators = append(lanInitiators, id)
			lanSet[id] = true
		}
		if slices.Contains(dev.Policies, "wan") && uplinkID != "" {
			edges = append(edges, TopoEdge{From: id, To: uplinkID, Layer: "policy", Kind: "policy:wan"})
		}
	}

	//O(n^2) guard: the frontend derives peers from Groups/Policies for larger groups
	maxCliqueMembers := 48

	//groups grant connectivity both ways between members
	for kind, ids := range members {
		if len(ids) > maxCliqueMembers {
			continue
		}
		sort.Strings(ids)
		for i := 0; i < len(ids); i++ {
			for j := i + 1; j < len(ids); j++ {
				edges = append(edges, TopoEdge{From: ids[i], To: ids[j], Layer: "policy", Kind: kind, Bidir: true})
			}
		}
	}

	//lan lets a device initiate to every device, not the other way around
	if len(allIDs) <= maxCliqueMembers {
		sort.Strings(lanInitiators)
		sort.Strings(allIDs)
		for _, from := range lanInitiators {
			for _, to := range allIDs {
				if to == from {
					continue
				}
				if lanSet[to] {
					if from < to {
						edges = append(edges, TopoEdge{From: from, To: to, Layer: "policy", Kind: "policy:lan", Bidir: true})
					}
				} else {
					edges = append(edges, TopoEdge{From: from, To: to, Layer: "policy", Kind: "policy:lan"})
				}
			}
		}
	}

	return edges
}

func endpointPolicyTopology(devices map[string]DeviceEntry, endpoints []Endpoint) ([]TopoNode, []TopoEdge) {
	nodes := []TopoNode{}
	edges := []TopoEdge{}

	for _, endpoint := range endpoints {
		if endpoint.Disabled || len(endpoint.Tags) == 0 {
			continue
		}

		dest := endpoint.IP
		if endpoint.Domain != "" {
			dest = endpoint.Domain
		}
		if endpoint.Port != "" {
			dest += ":" + endpoint.Port
		}

		id := "endpoint:" + endpoint.RuleName
		nodes = append(nodes, TopoNode{ID: id, Kind: "endpoint", Name: endpoint.RuleName, IP: dest, Tags: endpoint.Tags, Online: true})

		for _, dev := range devices {
			devID := deviceNodeID(dev)
			if devID == "" || isTopologyIsolated(dev) {
				continue
			}
			for _, tag := range endpoint.Tags {
				if slices.Contains(dev.DeviceTags, tag) {
					edges = append(edges, TopoEdge{From: devID, To: id, Layer: "policy", Kind: "endpoint:" + endpoint.RuleName})
					break
				}
			}
		}
	}

	return nodes, edges
}

func buildTopology(devices map[string]DeviceEntry, interfaces []InterfaceConfig,
	stations map[string]wifiStation, arp map[string]ArpEntry, activeWG map[string]bool,
	endpoints []Endpoint, apStatus map[string]map[string]string,
	activeIPs map[string]bool) Topology {

	nodes := []TopoNode{{ID: "router", Kind: "router", Name: "SPR", Online: true}}
	edges := []TopoEdge{}
	uplinkID := ""

	isWifiIface := func(name string) bool {
		for _, entry := range interfaces {
			if entry.Type == "AP" && (name == entry.Name || strings.HasPrefix(name, entry.Name+".")) {
				return true
			}
		}
		return false
	}

	for _, entry := range interfaces {
		if entry.Enabled != true {
			continue
		}

		id := "iface:" + entry.Name
		if entry.Type == "Uplink" {
			nodes = append(nodes, TopoNode{ID: id, Kind: "uplink", Name: entry.Name, Iface: entry.Name, Online: true})
			edges = append(edges, TopoEdge{From: "router", To: id, Layer: "l1", Kind: "uplink"})
			if uplinkID == "" {
				uplinkID = id
			}
		} else if entry.Type == "AP" {
			status := apStatus[entry.Name]
			nodes = append(nodes, TopoNode{ID: id, Kind: "ap_radio", Name: entry.Name, Iface: entry.Name,
				SSID: status["ssid[0]"], Radio: radioInfoFromStatus(status), Online: true})
			edges = append(edges, TopoEdge{From: "router", To: id, Layer: "l1", Kind: "wifi"})
		} else if entry.Type == "Downlink" {
			nodes = append(nodes, TopoNode{ID: id, Kind: "port", Name: entry.Name, Iface: entry.Name, Online: true})
			edges = append(edges, TopoEdge{From: "router", To: id, Layer: "l1", Kind: "wired"})
		}
	}

	wiredPortID := func(iface string) string {
		base := strings.Split(iface, ".")[0]
		for _, entry := range interfaces {
			if entry.Enabled == true && entry.Type == "Downlink" && entry.Name == base {
				return "iface:" + base
			}
		}
		return "router"
	}

	hasWG := false
	for _, dev := range devices {
		if dev.WGPubKey != "" {
			hasWG = true
			break
		}
	}
	if hasWG {
		nodes = append(nodes, TopoNode{ID: "iface:wg0", Kind: "vpn", Name: "wg0", Iface: "wg0", Online: true})
		edges = append(edges, TopoEdge{From: "router", To: "iface:wg0", Layer: "l1", Kind: "wg"})
	}

	for _, dev := range devices {
		id := deviceNodeID(dev)
		if id == "" {
			continue
		}

		node := TopoNode{
			ID:       id,
			Kind:     "device",
			Name:     dev.Name,
			MAC:      dev.MAC,
			IP:       dev.RecentIP,
			TinyNet:  tinyNetFromIP(dev.RecentIP),
			VLANTag:  dev.VLANTag,
			Iface:    dev.DHCPLastInterface,
			Groups:   dev.Groups,
			Policies: dev.Policies,
			Tags:     dev.DeviceTags,
			Isolated: isTopologyIsolated(dev),
			Style:    dev.Style,

			DHCPFirstTime: dev.DHCPFirstTime,
			DHCPLastTime:  dev.DHCPLastTime,
		}

		mac := strings.ToLower(dev.MAC)
		station, hasStation := stations[mac]
		arpEntry, hasArp := arp[mac]

		if hasStation {
			node.ConnType = "wifi"
			node.Iface = station.Iface
			node.Online = true
			node.Signal = &StationSignal{
				RSSI:   stationInt(station.Station, "signal"),
				TxRate: stationInt(station.Station, "tx_rate_info"),
				RxRate: stationInt(station.Station, "rx_rate_info"),
				Caps:   stationCaps(station.Station),
			}
			radio := "iface:" + strings.Split(station.Iface, ".")[0]
			edges = append(edges, TopoEdge{From: id, To: radio, Layer: "l1", Kind: "wifi", Metric: float64(node.Signal.RSSI)})
		} else if dev.WGPubKey != "" && activeWG[dev.RecentIP] {
			node.ConnType = "wireguard"
			node.Iface = "wg0"
			node.Online = true
			edges = append(edges, TopoEdge{From: id, To: "iface:wg0", Layer: "l1", Kind: "wg"})
		} else if hasArp && !isWifiIface(arpEntry.Device) &&
			(arpEntry.Flags == "0x2" || activeIPs[dev.RecentIP]) {
			//SPR seeds permanent (0x6) ARP entries, so presence needs a learned entry
			//or recent traffic; the seeded entry still tells us the port
			node.ConnType = "wired"
			node.Iface = arpEntry.Device
			node.Online = true
			edges = append(edges, TopoEdge{From: id, To: wiredPortID(arpEntry.Device), Layer: "l1", Kind: "wired"})
		} else {
			node.ConnType = "offline"
		}

		nodes = append(nodes, node)
	}

	edges = append(edges, devicePolicyEdges(devices, uplinkID)...)

	endpointNodes, endpointEdges := endpointPolicyTopology(devices, endpoints)
	nodes = append(nodes, endpointNodes...)
	edges = append(edges, endpointEdges...)

	topology := Topology{GeneratedAt: time.Now(), Nodes: nodes, Edges: edges}
	sortTopology(&topology)
	return topology
}

func sortTopology(topology *Topology) {
	sort.Slice(topology.Nodes, func(i, j int) bool {
		return topology.Nodes[i].ID < topology.Nodes[j].ID
	})
	sort.Slice(topology.Edges, func(i, j int) bool {
		a, b := topology.Edges[i], topology.Edges[j]
		if a.Layer != b.Layer {
			return a.Layer < b.Layer
		}
		if a.Kind != b.Kind {
			return a.Kind < b.Kind
		}
		if a.From != b.From {
			return a.From < b.From
		}
		return a.To < b.To
	})
}

type MeshLeafTopology struct {
	LeafIP   string
	Online   bool
	Topology json.RawMessage
}

func getMeshLeafTopologies() []MeshLeafTopology {
	c := http.Client{Timeout: 15 * time.Second}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", MESH_SOCKET_PATH)
		},
	}
	defer c.CloseIdleConnections()

	resp, err := c.Get("http://mesh/leafTopologies")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil
	}

	leaves := []MeshLeafTopology{}
	if json.NewDecoder(resp.Body).Decode(&leaves) != nil {
		return nil
	}
	return leaves
}

type PluginTopology struct {
	Name     string
	URI      string
	Topology Topology
}

func queryPluginTopology(unixPath string) (Topology, bool) {
	c := http.Client{Timeout: 2 * time.Second}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", unixPath)
		},
	}
	defer c.CloseIdleConnections()

	resp, err := c.Get("http://plugin/topology")
	if err != nil {
		return Topology{}, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Topology{}, false
	}

	topo := Topology{}
	if json.NewDecoder(resp.Body).Decode(&topo) != nil {
		return Topology{}, false
	}
	if len(topo.Nodes) == 0 {
		return Topology{}, false
	}
	return topo, true
}

func getPluginTopologies() []PluginTopology {
	Configmtx.Lock()
	plugins := []PluginConfig{}
	for _, entry := range config.Plugins {
		if entry.Enabled && entry.HasTopology && entry.UnixPath != "" && entry.URI != "" {
			plugins = append(plugins, entry)
		}
	}
	Configmtx.Unlock()

	results := make([]PluginTopology, len(plugins))
	found := make([]bool, len(plugins))
	var wg sync.WaitGroup
	for i, entry := range plugins {
		wg.Add(1)
		go func(i int, entry PluginConfig) {
			defer wg.Done()
			topo, ok := queryPluginTopology(entry.UnixPath)
			if ok {
				results[i] = PluginTopology{Name: entry.Name, URI: entry.URI, Topology: topo}
				found[i] = true
			}
		}(i, entry)
	}
	wg.Wait()

	out := []PluginTopology{}
	for i := range results {
		if found[i] {
			out = append(out, results[i])
		}
	}
	return out
}

var pluginTopoKinds = map[string]bool{
	"device":   true,
	"endpoint": true,
	"vpn":      true,
	"ap_radio": true,
	"port":     true,
}

const maxPluginTopoNodes = 256
const maxPluginSinks = 16

func mergePluginTopology(topology *Topology, name string, uri string, pluginTopo Topology) {
	rootID := "plugin:" + uri
	prefix := rootID + ":"

	rootConnType := ""
	for _, node := range pluginTopo.Nodes {
		if node.ID == "root" && node.ConnType != "" {
			rootConnType = node.ConnType
			break
		}
	}
	rootEdgeKind := rootConnType
	if rootEdgeKind == "" {
		rootEdgeKind = "wired"
	}

	topology.Nodes = append(topology.Nodes, TopoNode{ID: rootID, Kind: "extension", Name: name, ConnType: rootConnType, Online: true})
	topology.Edges = append(topology.Edges, TopoEdge{From: "router", To: rootID, Layer: "l1", Kind: rootEdgeKind})

	nodes := pluginTopo.Nodes
	if len(nodes) > maxPluginTopoNodes {
		nodes = nodes[:maxPluginTopoNodes]
	}

	added := map[string]bool{}
	order := []string{}
	for _, node := range nodes {
		if node.ID == "" || node.ID == "root" {
			continue
		}
		node.ID = prefix + node.ID
		if added[node.ID] {
			continue
		}
		if !pluginTopoKinds[node.Kind] {
			node.Kind = "device"
		}
		topology.Nodes = append(topology.Nodes, node)
		added[node.ID] = true
		order = append(order, node.ID)
	}

	sinks := pluginTopo.Sinks
	if len(sinks) > maxPluginSinks {
		sinks = sinks[:maxPluginSinks]
	}
	for _, sink := range sinks {
		if sink.ID == "" || sink.Iface == "" {
			continue
		}
		id := prefix + "sink:" + sink.ID
		if added[id] {
			continue
		}
		added[id] = true
		sinkName := sink.Name
		if sinkName == "" {
			sinkName = sink.Iface
		}
		topology.Nodes = append(topology.Nodes, TopoNode{ID: id, Kind: "sink", Name: sinkName,
			IP: sink.IP, Iface: sink.Iface, Online: sink.Online})
		topology.Edges = append(topology.Edges, TopoEdge{From: rootID, To: id, Layer: "l1", Kind: "wired"})
		topology.Sinks = append(topology.Sinks, TopoSink{ID: id, Name: sinkName, Iface: sink.Iface,
			IP: sink.IP, Online: sink.Online})
	}

	mapID := func(id string) string {
		if id == "" || id == "root" || id == "router" {
			return rootID
		}
		return prefix + id
	}

	linked := map[string]bool{}
	for _, edge := range pluginTopo.Edges {
		from := mapID(edge.From)
		to := mapID(edge.To)
		if from == to {
			continue
		}
		if from != rootID && !added[from] {
			continue
		}
		if to != rootID && !added[to] {
			continue
		}
		kind := edge.Kind
		if kind == "" {
			kind = "wired"
		}
		topology.Edges = append(topology.Edges, TopoEdge{From: from, To: to, Layer: "l1", Kind: kind, Metric: edge.Metric})
		linked[from] = true
		linked[to] = true
	}

	for _, id := range order {
		if !linked[id] {
			topology.Edges = append(topology.Edges, TopoEdge{From: rootID, To: id, Layer: "l1", Kind: "wired"})
		}
	}
}

// mirror of pfw's rule types, just enough to derive device -> sink edges
type pfwClientIdentifier struct {
	Identity string
	Group    string
	SrcIP    string
	Tag      string
}

type pfwAddress struct {
	Domain string
	IP     string
}

type pfwForwardingRule struct {
	RuleName        string
	Disabled        bool
	Client          pfwClientIdentifier
	Protocol        string
	OriginalDst     pfwAddress
	OriginalDstPort string
	Dst             pfwAddress
	DstInterface    string
}

func getPFWForwardingRules() []pfwForwardingRule {
	Configmtx.Lock()
	unixPath := ""
	for _, entry := range config.Plugins {
		if entry.Enabled && entry.URI == "pfw" && entry.UnixPath != "" {
			unixPath = entry.UnixPath
			break
		}
	}
	Configmtx.Unlock()
	if unixPath == "" {
		return nil
	}

	c := http.Client{Timeout: 2 * time.Second}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", unixPath)
		},
	}
	defer c.CloseIdleConnections()

	resp, err := c.Get("http://plugin/config")
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil
	}

	cfg := struct{ ForwardingRules []pfwForwardingRule }{}
	if json.NewDecoder(resp.Body).Decode(&cfg) != nil {
		return nil
	}
	return cfg.ForwardingRules
}

func sinkRouteEdgeKind(rule pfwForwardingRule) string {
	if rule.OriginalDstPort != "" {
		if rule.OriginalDstPort == "53" {
			return "route:dns"
		}
		return "route:split"
	}
	if rule.OriginalDst.Domain != "" ||
		(rule.OriginalDst.IP != "" && rule.OriginalDst.IP != "0.0.0.0/0") {
		return "route:split"
	}
	return "route"
}

func ruleClientDeviceIDs(client pfwClientIdentifier, devices map[string]DeviceEntry) []string {
	ids := []string{}
	for key, dev := range devices {
		id := deviceNodeID(dev)
		if id == "" || isTopologyIsolated(dev) {
			continue
		}
		match := (client.SrcIP != "" && dev.RecentIP == client.SrcIP) ||
			(client.Identity != "" && (key == client.Identity ||
				strings.EqualFold(dev.MAC, client.Identity) || dev.WGPubKey == client.Identity)) ||
			(client.Group != "" && slices.Contains(dev.Groups, client.Group)) ||
			(client.Tag != "" && slices.Contains(dev.DeviceTags, client.Tag))
		if match {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	return ids
}

// devices routed to an advertised sink via pfw ForwardingRules show up as
// policy edges: route (all traffic), route:split (CIDR/domain), route:dns
func mergeSinkRouteEdges(topology *Topology, devices map[string]DeviceEntry) {
	if len(topology.Sinks) == 0 {
		return
	}

	ifaceToSink := map[string]string{}
	for _, sink := range topology.Sinks {
		if sink.Iface != "" {
			if _, exists := ifaceToSink[sink.Iface]; !exists {
				ifaceToSink[sink.Iface] = sink.ID
			}
		}
	}

	seen := map[string]bool{}
	for _, rule := range getPFWForwardingRules() {
		if rule.Disabled || rule.DstInterface == "" {
			continue
		}
		sinkID, exists := ifaceToSink[rule.DstInterface]
		if !exists {
			continue
		}
		kind := sinkRouteEdgeKind(rule)
		for _, devID := range ruleClientDeviceIDs(rule.Client, devices) {
			key := devID + "|" + sinkID + "|" + kind
			if seen[key] {
				continue
			}
			seen[key] = true
			topology.Edges = append(topology.Edges, TopoEdge{From: devID, To: sinkID, Layer: "policy", Kind: kind})
		}
	}
}

func removeTopoNode(topology *Topology, id string) {
	nodes := topology.Nodes[:0]
	for _, node := range topology.Nodes {
		if node.ID != id {
			nodes = append(nodes, node)
		}
	}
	topology.Nodes = nodes

	edges := topology.Edges[:0]
	for _, edge := range topology.Edges {
		if edge.From != id && edge.To != id {
			edges = append(edges, edge)
		}
	}
	topology.Edges = edges
}

func mergeLeafTopology(topology *Topology, leafIP string, leafTopo Topology, online bool, arp map[string]ArpEntry) {
	leafID := "spr:" + leafIP

	attachTo := "router"
	for _, entry := range arp {
		if entry.IP == leafIP && entry.Flags != "0x0" {
			base := "iface:" + strings.Split(entry.Device, ".")[0]
			for _, node := range topology.Nodes {
				if node.ID == base && (node.Kind == "port" || node.Kind == "uplink") {
					attachTo = base
				}
			}
		}
	}

	//the leaf also has a DHCP lease from us; drop its device node in favor of leafID
	leafName := ""
	for _, node := range topology.Nodes {
		if node.Kind == "device" && node.IP == leafIP {
			leafName = node.Name
			removeTopoNode(topology, node.ID)
			break
		}
	}

	name := "SPR Leaf"
	if leafName != "" {
		name = leafName + " (Mesh Node)"
	}

	topology.Nodes = append(topology.Nodes, TopoNode{ID: leafID, Kind: "leaf_router", Name: name, IP: leafIP, Online: online})
	topology.Edges = append(topology.Edges, TopoEdge{From: attachTo, To: leafID, Layer: "l1", Kind: "wired"})

	if !online {
		return
	}

	leafNodes := map[string]TopoNode{}
	for _, node := range leafTopo.Nodes {
		leafNodes[node.ID] = node
		if node.Kind == "ap_radio" {
			id := leafID + ":" + node.ID
			topology.Nodes = append(topology.Nodes, TopoNode{ID: id, Kind: "ap_radio", Name: node.Name, Iface: node.Iface,
				SSID: node.SSID, Radio: node.Radio, Online: node.Online})
			topology.Edges = append(topology.Edges, TopoEdge{From: leafID, To: id, Layer: "l1", Kind: "wifi"})
		}
	}

	nodeIndex := map[string]int{}
	for i, node := range topology.Nodes {
		nodeIndex[node.ID] = i
	}

	for _, edge := range leafTopo.Edges {
		if edge.Layer != "l1" || edge.Kind != "wifi" || !strings.HasPrefix(edge.From, "dev:") {
			continue
		}

		leafDev, exists := leafNodes[edge.From]
		if !exists {
			continue
		}

		radio := leafID + ":iface:" + strings.Split(leafDev.Iface, ".")[0]
		if i, exists := nodeIndex[edge.From]; exists {
			node := &topology.Nodes[i]
			node.ConnType = "wifi"
			node.Iface = leafDev.Iface
			node.Online = true
			node.Signal = leafDev.Signal
			edges := topology.Edges[:0]
			for _, e := range topology.Edges {
				if !(e.Layer == "l1" && e.From == edge.From) {
					edges = append(edges, e)
				}
			}
			topology.Edges = edges
		} else {
			topology.Nodes = append(topology.Nodes, leafDev)
			nodeIndex[edge.From] = len(topology.Nodes) - 1
		}
		topology.Edges = append(topology.Edges, TopoEdge{From: edge.From, To: radio, Layer: "l1", Kind: "wifi", Metric: edge.Metric})
	}
}

func mergeMeshTopology(topology *Topology, arp map[string]ArpEntry, activeIPs map[string]bool) {
	if isLeafRouter() {
		return
	}
	for _, leaf := range getMeshLeafTopologies() {
		leafTopo := Topology{}
		apiOK := leaf.Online && json.Unmarshal(leaf.Topology, &leafTopo) == nil
		//an unreachable or not-yet-upgraded leaf API is not the same as offline
		online := apiOK || activeIPs[leaf.LeafIP]
		mergeLeafTopology(topology, leaf.LeafIP, leafTopo, online, arp)
	}
	sortTopology(topology)
}

func showTopology(w http.ResponseWriter, r *http.Request) {
	Devicesmtx.Lock()
	devices := convertDevicesPublic(getDevicesJson())
	Devicesmtx.Unlock()
	delete(devices, "pending")

	Interfacesmtx.Lock()
	interfaces := loadInterfacesConfigLocked()
	Interfacesmtx.Unlock()

	arp := map[string]ArpEntry{}
	if entries, err := GetArpEntries(); err == nil {
		for _, entry := range entries {
			arp[strings.ToLower(entry.MAC)] = entry
		}
	}

	activeWG := map[string]bool{}
	activeIPs, _ := getWireguardActivePeers()
	for _, ip := range activeIPs {
		activeWG[ip] = true
	}

	FWmtx.Lock()
	endpoints := append([]Endpoint{}, gFirewallConfig.Endpoints...)
	FWmtx.Unlock()

	recentIPs := getRecentlyActiveIPs(5)
	topology := buildTopology(devices, interfaces, getTopologyWifiStations(interfaces), arp, activeWG, endpoints, getAPStatus(interfaces), recentIPs)
	mergeMeshTopology(&topology, arp, recentIPs)

	for _, plugin := range getPluginTopologies() {
		mergePluginTopology(&topology, plugin.Name, plugin.URI, plugin.Topology)
	}

	mergeSinkRouteEdges(&topology, devices)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(topology)
}
