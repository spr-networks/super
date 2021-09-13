package main

import (
	"crypto/md5"
	b64 "encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"

	"github.com/vishvananda/netlink"
	"golang.org/x/sys/unix"

	"github.com/dreadl0ck/ja3"
	"regexp"

	"flag"
	"io/ioutil"

	"net/http"
	_ "net/http/pprof"
)

var DATA_FILE *string
var MapsUpdated = false

type eKey struct {
	SrcId  int64
	Rawval [16]byte
}

func (e eKey) MarshalText() (text []byte, err error) {
	return []byte(fmt.Sprintf("%d-%s", e.SrcId, b64.StdEncoding.EncodeToString(e.Rawval[:]))), nil
}

func (e *eKey) UnmarshalText(data []byte) error {
	s := string(data)
	n, err := fmt.Sscanf(s, "%d", &e.SrcId)
	if err != nil {
		return err
	}
	if n != 1 {
		return fmt.Errorf("did not convert srcId")
	}
	idx := strings.Index(s, "-") + 1
	if idx == 0 {
		return fmt.Errorf("missing separator")
	}

	_, err = b64.StdEncoding.Decode(e.Rawval[:], data[idx:])
	if err != nil {
		return err
	}
	return nil
}

type eVal struct {
	T            time.Time
	SrcId        int64
	EndpointType gopacket.EndpointType
	Rawval       [16]byte
}

type fKey struct {
	SrcId    int64
	ParentId int64
	AId      int64
	BId      int64
}

func (f fKey) MarshalText() (text []byte, err error) {
	return []byte(fmt.Sprintf("%d-%d-%d-%d", f.SrcId, f.ParentId, f.AId, f.BId)), nil
}

func (f *fKey) UnmarshalText(data []byte) error {
	s := string(data)
	n, err := fmt.Sscanf(s, "%d-%d-%d-%d", &f.SrcId, &f.ParentId, &f.AId, &f.BId)
	if err != nil || n != 4 {
		return fmt.Errorf("Failed to convert fKey")
	}
	return nil
}

type fVal struct {
	T         time.Time
	LayerType int
	SrcId     int64
	ParentId  int64
	AId       int64
	BId       int64
}

type dKey struct {
	InterfaceName   string
	HardwareAddress string
	HostName        string
	PrimaryAddress  string
}

func (d dKey) MarshalText() (text []byte, err error) {
	return []byte(fmt.Sprintf("%s %s %s %s", d.InterfaceName, d.HardwareAddress, d.HostName, d.PrimaryAddress)), nil
}

func (d *dKey) UnmarshalText(data []byte) error {
	s := string(data)
	n, err := fmt.Sscanf(s, "%s %s %s %s", &d.InterfaceName, &d.HardwareAddress, &d.HostName, &d.PrimaryAddress)
	if err != nil || n != 4 {
		fmt.Println("FAIL", n)
		fmt.Println("FAIL", s)
		return fmt.Errorf("Failed to convert dKey %d converted from %s", n, s)
	}
	return nil
}

var EPHEMERAL_WILDCARD_PORT_ID = int64(-1000)

type FlowGatherState struct {
	DataSources      map[dKey]int64
	LastDataSourceId int64
	EndpointVals     map[gopacket.EndpointType]map[int64]eVal
	Endpoints        map[gopacket.EndpointType]map[eKey]int64
	LastEndpointId   int64
	FlowVals         map[gopacket.LayerType]map[int64]fVal
	Flows            map[gopacket.LayerType]map[fKey]int64
	LastFlowId       int64
}

var g FlowGatherState

func InitDB(filepath string) {

	g = FlowGatherState{
		DataSources:    make(map[dKey]int64),
		EndpointVals:   make(map[gopacket.EndpointType]map[int64]eVal),
		Endpoints:      make(map[gopacket.EndpointType]map[eKey]int64),
		LastEndpointId: 0,
		FlowVals:       make(map[gopacket.LayerType]map[int64]fVal),
		Flows:          make(map[gopacket.LayerType]map[fKey]int64),
		LastFlowId:     0,
	}

	//beware -> registering new endpoint and layer types needs the hot maps updated
	for val := 0; val <= 1000; val++ {
		g.Endpoints[gopacket.EndpointType(val)] = make(map[eKey]int64)
		g.EndpointVals[gopacket.EndpointType(val)] = make(map[int64]eVal)
		g.Flows[gopacket.LayerType(val)] = make(map[fKey]int64)
		g.FlowVals[gopacket.LayerType(val)] = make(map[int64]fVal)
	}

	//load up the maps from disk
	b, err := ioutil.ReadFile(filepath)
	if err == nil && len(b) > 2 {
		var f FlowGatherState
		err = json.Unmarshal(b, &f)
		if err != nil {
			log.Fatal(err)
		}
		g = f
	}

	go func() {
		for {
			time.Sleep(time.Minute * 5)
			saveJSON(*DATA_FILE)
		}
	}()

}

func listenNewInterfaceUp(callback func(string)) {
	lnkupdate := make(chan netlink.LinkUpdate)
	lnkdone := make(chan struct{})
	err := netlink.LinkSubscribe(lnkupdate, lnkdone)
	if err != nil {
		fmt.Println("failed to netlink")
		return
	}

	for {
		select {
		case msg := <-lnkupdate:
			{
				if msg.Change == unix.IFF_UP {
					go callback(msg.Attrs().Name)
				}
			}
		}
	}
}

func establishInterfaces() {

	ifaces, err := net.Interfaces()
	if err != nil {
		fmt.Println("failed net interfaces")
		return
	}

	//join all existing interfaces for mdns
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		go listenInterface(iface.Name)
	}

}

func debugPrint(level int, val ...interface{}) {
	if level > 2 {
		fmt.Println(val...)
	}
}

var interfaceMutex sync.Mutex

func findOrSaveInterface(ifaceNameTarget string) int64 {
	// synce interfaces come up in parallel, synchronize the id creation
	interfaceMutex.Lock()
	defer interfaceMutex.Unlock()

	var ifaceName = ifaceNameTarget
	pieces := strings.Split(ifaceNameTarget, ".")
	if len(pieces) > 1 {
		ifaceName = pieces[0]
	}

	iface, err := net.InterfaceByName(ifaceNameTarget)
	if err != nil {
		log.Fatal(err)
	}

	hostname, err := os.Hostname()
	if err != nil {
		log.Fatal(err)
	}

	addrs, err := iface.Addrs()

	var primaryAddress = "nil"

	for _, addr := range addrs {
		//golang is a pain here, need to conver to string and back since theres no IPNet interface
		ip, _, err := net.ParseCIDR(addr.String())
		if err != nil {
			continue
		}
		if ip.IsLinkLocalUnicast() || ip.IsLoopback() {
			continue
		}
		primaryAddress = ip.String()
	}

	//if an interface has no layer 2 address
	hardwareAddr := iface.HardwareAddr
	if hardwareAddr == nil {
		hardwareAddr = []byte{0, 0, 0, 0, 0, 0}
	}

	hwString := strings.Replace(hardwareAddr.String(), ":", "", -1)

	fmt.Println("looking up interface", ifaceName, hwString, hostname, primaryAddress)
	//check if the data source already exists
	lastId, exists := g.DataSources[dKey{ifaceName, hwString, hostname, primaryAddress}]
	if exists {
		return lastId
	}

	lastId = g.LastDataSourceId + 1
	g.LastDataSourceId = g.LastDataSourceId + 1
	g.DataSources[dKey{ifaceName, hwString, hostname, primaryAddress}] = lastId

	fmt.Println("saved new interface", ifaceName, hwString, hostname, primaryAddress)

	return lastId

}

type iPacket struct {
	iface    string
	iface_id int64
	packet   *gopacket.Packet
}

var GLC = make(chan iPacket)

func listenInterface(iface string) {

	var (
		buffer = int32(65535)
		filter = ""
	)

	if !deviceExists(iface) {
		log.Fatal("Unable to open device ", iface)
	}

	fmt.Println("listen", iface)
	handler, err := pcap.OpenLive(iface, buffer, false, pcap.BlockForever)

	if err != nil {
		log.Fatal(err)
	}

	iface_id := findOrSaveInterface(iface)

	defer handler.Close()

	if err := handler.SetBPFFilter(filter); err != nil {
		log.Fatal(err)
	}

	source := gopacket.NewPacketSource(handler, handler.LinkType())
	source.Lazy = true
	source.NoCopy = true
	source.DecodeStreamsAsDatagrams = true
	source.SkipDecodeRecovery = true

	count := 0
	for packet := range source.Packets() {
		GLC <- iPacket{iface, iface_id, &packet}
		count++
	}
	debugPrint(2, "total", count)
}

func handleData() {
	for data := range GLC {
		saveFlows(data.iface, data.iface_id, *data.packet)
	}

}

func saveJSON(fn string) {
	var err error
	var b []byte

	fmt.Println("save JSON")
	if MapsUpdated {
		b, err = json.Marshal(g)
	}
	MapsUpdated = false

	if err == nil {
		ioutil.WriteFile(fn, b, 0644)
	} else {
		fmt.Println("failed to save", err)
	}
}

func main() {
	var profile = flag.String("profile", "", "run profiler service on :6000")
	DATA_FILE = flag.String("jsonData", "/data/flowgather.json", "path to save json state")
	flag.Parse()

	debugPrint(2, "--= Flow capture =--")

	InitDB(*DATA_FILE)

	establishInterfaces()

	go listenNewInterfaceUp(listenInterface)

	if *profile != "" {
		go handleData()
		log.Println(http.ListenAndServe("0.0.0.0:6060", nil))
	} else {
		handleData()
	}

}

func newFlowOutput(layerType int, id int64, parent int64, flow gopacket.Flow) {
	flows := os.Stdout
	fmt.Fprintf(flows, "kind=newflow layerType=%d id=%d parent=%d flow=%s\n", layerType, id, parent, flow.String())
}

func tlsFingerprintOutput(kind string, parent int64, fingerprint string) {
	sum := md5.Sum([]byte(fingerprint))
	md5 := hex.EncodeToString(sum[:])

	tls_fingerprints := os.Stdout
	fmt.Fprintf(tls_fingerprints, "kind=%s parent=%d fingerprint=%s md5=%s\n", kind, parent, fingerprint, md5)
}

var filterPrintables = regexp.MustCompile("[^A-Za-z0-9.-_ ]+")

func dnsRepliesOutput(parent int64, responseCode string, questions string, answers string) {
	dns_replies := os.Stdout

	responseCode = filterPrintables.ReplaceAllString(responseCode, "")
	questions = filterPrintables.ReplaceAllString(questions, "")
	answers = filterPrintables.ReplaceAllString(answers, "")

	fmt.Fprintf(dns_replies, "kind=dnsReply parent=%d responseCode='%s' questions='%s' answers='%s'\n", parent, responseCode, questions, answers)
}

func handleTLSFP(tls *layers.TLS, parentBiflowId int64, packet gopacket.Packet) {
	// do things with tls variable
	for _, handshake := range tls.Handshake {
		if handshake.ContentType == layers.TLSHandshake {
			clientFingerprint := string(ja3.BarePacket(packet))
			serverFingerprint := string(ja3.BarePacketJa3s(packet))

			if clientFingerprint != "" {
				tlsFingerprintOutput("tlsFPClient", parentBiflowId, clientFingerprint)
			}

			if serverFingerprint != "" {
				tlsFingerprintOutput("tlsFPServer", parentBiflowId, serverFingerprint)
			}

		}
	}
}

func handlePayload(payload gopacket.Payload, packet gopacket.Packet, parentBiflowId int64) {
	//try to decode as TLS
	var tls layers.TLS
	var decoded []gopacket.LayerType
	parser := gopacket.NewDecodingLayerParser(layers.LayerTypeTLS, &tls)
	err := parser.DecodeLayers(packet.ApplicationLayer().LayerContents(), &decoded)
	if err == nil {
		for _, layerType := range decoded {
			switch layerType {
			case layers.LayerTypeTLS:
				handleTLSFP(&tls, parentBiflowId, packet)
			}
		}
	}

}

func handleDNS(payload gopacket.Payload, packet gopacket.Packet, dns *layers.DNS, parentBiflowId int64) {

	questionsString := ""
	answersString := ""

	//debugPrint(2, dns.Answers)
	//dnsOpCode := int(dns.OpCode)
	dnsResponseCode := int(dns.ResponseCode)

	for _, dnsQuestion := range dns.Questions {
		questionsString += string(dnsQuestion.Name)
	}

	dnsANCount := int(dns.ANCount)
	if dnsANCount == 0 && dnsResponseCode == 0 {
		//do not process no answers and no error
		return
	}
	if (dnsANCount == 0 && dnsResponseCode > 0) || (dnsANCount > 0) {

		/*
			debugPrint(2, "————————")
			debugPrint(2, "    DNS Record Detected")


			//t := time.Now()
			//timestamp := t.Format(time.RFC3339)

			debugPrint(2, "    DNS OpCode: ", strconv.Itoa(int(dns.OpCode)))
			debugPrint(2, "    DNS ResponseCode: ", dns.ResponseCode.String())
			debugPrint(2, "    DNS # Answers: ", strconv.Itoa(dnsANCount))
			debugPrint(2, "    DNS Question: ", string(dnsQuestion.Name),  packet.Metadata().Timestamp)
			//debugPrint(2, "    DNS Endpoints: ", SrcIP, DstIP)
		*/
		if dnsANCount > 0 {

			for idx, dnsAnswer := range dns.Answers {
				answersString += dnsAnswer.Type.String() + " "
				debugPrint(2, "    DNS Type", dnsAnswer.Type.String())
				if dnsAnswer.IP.String() != "<nil>" {
					debugPrint(2, "    DNS Answer IP: ", dnsAnswer.IP.String())
					answersString += dnsAnswer.IP.String()
				} else if dnsAnswer.CNAME != nil {
					debugPrint(2, "    DNS Answer CNAME: ", string(dnsAnswer.CNAME))
					answersString += string(dnsAnswer.CNAME)
				} else if dnsAnswer.PTR != nil {
					debugPrint(2, "    DNS Answer PTR: ", string(dnsAnswer.PTR))
					answersString += string(dnsAnswer.PTR)
				} else if dnsAnswer.URI.Target != nil {
					debugPrint(2, "    DNS Answer URI:", string(dnsAnswer.URI.Target))
					answersString += string(dnsAnswer.URI.Target)
				} else if dnsAnswer.SRV.Name != nil {
					debugPrint(2, "    DNS Answer SRV:", string(dnsAnswer.SRV.Name)+":"+strconv.Itoa(int(dnsAnswer.SRV.Port)))
					answersString += string(dnsAnswer.SRV.Name) + ":" + strconv.Itoa(int(dnsAnswer.SRV.Port))
				}

				if idx != dnsANCount {
					answersString += ","
				}

			}

		}
	}

	debugPrint(2, questionsString)
	debugPrint(2, answersString)

	dnsRepliesOutput(parentBiflowId, dns.ResponseCode.String(), questionsString, answersString)
}

func findOrMakeEndpoint(ifaceId int64, endpoint gopacket.Endpoint, t time.Time, makeEndpoint bool) int64 {
	e_type := endpoint.EndpointType()

	var b16 [16]byte

	if len(endpoint.Raw()) > 16 {
		panic("endpoint too big")
	}
	copy(b16[:], endpoint.Raw())

	ret, exists := g.Endpoints[e_type][eKey{ifaceId, b16}]
	if exists {
		return ret
	}

	if !makeEndpoint {
		return -1
	}

	MapsUpdated = true
	lastId := g.LastEndpointId + 1
	g.LastEndpointId = lastId
	g.Endpoints[e_type][eKey{ifaceId, b16}] = lastId
	g.EndpointVals[e_type][lastId] = eVal{t, ifaceId, endpoint.EndpointType(), b16}

	return lastId
}

func saveFlow(ifaceId int64, layerType int, previous int64, flow gopacket.Flow, t time.Time, srcPort int, dstPort int) int64 {
	//look for it in one direction
	//tbd, bidir flow update

	aEid := findOrMakeEndpoint(ifaceId, flow.Src(), t, true)
	bEid := findOrMakeEndpoint(ifaceId, flow.Dst(), t, true)

	l_type := gopacket.LayerType(layerType)

	//check if in fCache
	ret, exists := g.Flows[l_type][fKey{ifaceId, previous, aEid, bEid}]
	if exists {
		return ret
	}

	ret, exists = g.Flows[l_type][fKey{ifaceId, previous, bEid, aEid}]
	if exists {
		return ret
	}

	MapsUpdated = true

	lastId := g.LastFlowId + 1
	g.LastFlowId = lastId

	g.Flows[l_type][fKey{ifaceId, previous, aEid, bEid}] = lastId
	g.FlowVals[l_type][lastId] = fVal{t, layerType, ifaceId, previous, aEid, bEid}

	// ephemeral port heuristic support
	if gopacket.LayerType(layerType) == layers.LayerTypeUDP || gopacket.LayerType(layerType) == layers.LayerTypeTCP {
		src_eph, dst_eph := isEphemeralPortPair(srcPort, dstPort)
		if src_eph && !dst_eph {
			g.Flows[l_type][fKey{ifaceId, previous, EPHEMERAL_WILDCARD_PORT_ID, bEid}] = lastId
		} else if !src_eph && dst_eph {
			g.Flows[l_type][fKey{ifaceId, previous, aEid, EPHEMERAL_WILDCARD_PORT_ID}] = lastId
		}
	}

	newFlowOutput(layerType, lastId, previous, flow)
	return lastId
}

// same underlying data structure -- flows
func saveLinkFlow(ifaceId int64, layerType int, previous int64, flow gopacket.Flow, t time.Time) int64 {
	return saveFlow(ifaceId, layerType, previous, flow, t, 0, 0)
}

var saveNetworkFlow = saveLinkFlow

func saveTransportFlow(ifaceId int64, layerType int, previous int64, flow gopacket.Flow, t time.Time, srcPort int, dstPort int) int64 {
	return saveFlow(ifaceId, layerType, previous, flow, t, srcPort, dstPort)
}

func isEphemeralPortPair(srcPort int, dstPort int) (bool, bool) {
	src_eph := false
	dst_eph := false

	//IANA range is 49152-65535 (RFC 6056)
	// linux tends to use 32768...

	if srcPort >= 32768 {
		src_eph = true
	}

	if dstPort >= 32768 {
		dst_eph = true
	}

	//but it gets more complicated.  For client-side DNS spoofing protection,
	// things can go much lower
	if dstPort == 53 {
		return true, false
	} else if srcPort == 53 {
		return false, true
	}

	return src_eph, dst_eph
}

func portHeuristic(ifaceId int64, previousFlowId int64, l_type gopacket.LayerType, srcPort int, dstPort int, srcE gopacket.Endpoint, dstE gopacket.Endpoint) bool {
	//Heuristic: If one end uses an ephemeral port and the other doesnt, match on the
	// non ephemeral port

	//edge case #1, both above, no clear server
	src_eph, dst_eph := isEphemeralPortPair(srcPort, dstPort)

	if src_eph && dst_eph {
		return true
	}

	//edge case #2, both below, no clear server
	if !src_eph && !dst_eph {
		return true
	}

	endpoint := dstE
	if dst_eph {
		endpoint = srcE
	}

	Eid := findOrMakeEndpoint(ifaceId, endpoint, time.Now(), false)
	if Eid == -1 {
		// non ephemral port not in endpoint db
		return true
	}

	//check if Eid communicated with any ephemeral port under the previous flow
	_, exists := g.Flows[l_type][fKey{ifaceId, previousFlowId, Eid, EPHEMERAL_WILDCARD_PORT_ID}]
	if exists {
		return false
	}

	_, exists = g.Flows[l_type][fKey{ifaceId, previousFlowId, EPHEMERAL_WILDCARD_PORT_ID, Eid}]
	if exists {
		return false
	}

	//if it did not already exist return true
	return true
}

func shouldSaveTransportFlowTCP(ifaceId int64, previousFlowId int64, tcp *layers.TCP) bool {

	//If a syn/ack is set, try save that flow since a server accepted a connection
	if tcp.SYN && tcp.ACK {
		return portHeuristic(ifaceId, previousFlowId, tcp.LayerType(), int(tcp.SrcPort), int(tcp.DstPort), tcp.TransportFlow().Src(), tcp.TransportFlow().Dst())
	}

	return false
}

func shouldSaveTransportFlowUDP(ifaceId int64, previousFlowId int64, udp *layers.UDP) bool {
	return portHeuristic(ifaceId, previousFlowId, udp.LayerType(), int(udp.SrcPort), int(udp.DstPort), udp.TransportFlow().Src(), udp.TransportFlow().Dst())
}
func saveFlows(ifaceName string, ifaceId int64, packet gopacket.Packet) {

	/*
		// OSI Layer 2
		linkLayer := packet.LinkLayer();
		// OSI Layer 3
		netLayer := packet.NetworkLayer()
		// OSI Layer 4
		transportLayer := packet.TransportLayer()

		//packet.ApplicationLayer()  for getting .Payload()

		// packet.ErrorLayer  for decoding errors. log those

		//the above method breaks down. No easy way to iterate through all of them.
		// Have to cast to get NextLayerType() etc and its not any good.
		//better approach is below, just iterate through each layer and collect
	*/

	debugPrint(2, "==")

	previousFlowId := (int64)(-1)
	t := packet.Metadata().Timestamp

	for _, layer := range packet.Layers() {
		switch layer.LayerType() {
		case layers.LayerTypeDot1Q:
		case layers.LayerTypePPP:
		case layers.LayerTypePPPoE:
		case layers.LayerTypeEthernet:
			eth, _ := layer.(*layers.Ethernet)
			debugPrint(2, layer.LayerType(), eth.LinkFlow())

			previousFlowId = saveLinkFlow(ifaceId, int(layer.LayerType()), previousFlowId, eth.LinkFlow(), t)
		case layers.LayerTypeARP:
			arp, _ := layer.(*layers.ARP)
			//arp bridges a hardware address layer to a protocol address. Example, Ethernet and IP.... This means theres two flows to record (hw + protocol)
			arpFlow := gopacket.NewFlow(layers.EndpointMAC, arp.SourceHwAddress, arp.DstHwAddress)
			previousFlowId = saveLinkFlow(ifaceId, int(layer.LayerType()), previousFlowId, arpFlow, t)

			protocolFlowType := layers.EndpointMAC
			//try to get a more specific type
			if arp.Protocol == layers.EthernetTypeIPv4 {
				protocolFlowType = layers.EndpointIPv4
			} else if arp.Protocol == layers.EthernetTypeIPv6 {
				protocolFlowType = layers.EndpointIPv6
			} else if arp.Protocol == layers.EthernetTypePPP {
				protocolFlowType = layers.EndpointPPP
			}
			arpProtocolFlow := gopacket.NewFlow(protocolFlowType, arp.SourceProtAddress, arp.DstProtAddress)

			// should the layer type be other than ARP? for example the arp protocol?
			previousFlowId = saveLinkFlow(ifaceId, int(layer.LayerType()), previousFlowId, arpProtocolFlow, t)

			debugPrint(2, layer.LayerType(), arpFlow, arpProtocolFlow)
		case layers.LayerTypeIPv4:
			ip4, _ := layer.(*layers.IPv4)
			debugPrint(2, layer.LayerType(), ip4.NetworkFlow())

			previousFlowId = saveNetworkFlow(ifaceId, int(layer.LayerType()), previousFlowId, ip4.NetworkFlow(), t)

		case layers.LayerTypeIPv6:
			ip6, _ := layer.(*layers.IPv6)
			debugPrint(2, layer.LayerType(), ip6.NetworkFlow())

			previousFlowId = saveNetworkFlow(ifaceId, int(layer.LayerType()), previousFlowId, ip6.NetworkFlow(), t)
		case layers.LayerTypeICMPv4:
			//icmp, _ := layer.(*layers.ICMPv4)
			//icmp is more of a data payload. logging tbd
		case layers.LayerTypeICMPv6:
			//icmp, _ := layer.(*layers.ICMPv6)
			//logging tbd
		case layers.LayerTypeTCP:
			tcp, _ := layer.(*layers.TCP)
			debugPrint(2, layer.LayerType(), tcp.TransportFlow())
			if shouldSaveTransportFlowTCP(ifaceId, previousFlowId, tcp) {
				previousFlowId = saveTransportFlow(ifaceId, int(layer.LayerType()), previousFlowId, tcp.TransportFlow(), t, int(tcp.SrcPort), int(tcp.DstPort))
			}
		case layers.LayerTypeUDP:
			udp, _ := layer.(*layers.UDP)
			debugPrint(2, layer.LayerType(), udp.TransportFlow())
			if shouldSaveTransportFlowUDP(ifaceId, previousFlowId, udp) {
				previousFlowId = saveTransportFlow(ifaceId, int(layer.LayerType()), previousFlowId, udp.TransportFlow(), t, int(udp.SrcPort), int(udp.DstPort))
			}
		case layers.LayerTypeDNS:
			dns, _ := layer.(*layers.DNS)
			handleDNS(layer.LayerContents(), packet, dns, previousFlowId)
		case layers.LayerTypeTLS:
			tls := layer.(*layers.TLS)
			handleTLSFP(tls, previousFlowId, packet)
		case gopacket.LayerTypePayload:
			handlePayload(layer.LayerContents(), packet, previousFlowId)
		case gopacket.LayerTypeDecodeFailure:
			continue
		default:
			debugPrint(3, "- unhandled layer type ", layer.LayerType(), int(layer.LayerType()), "on", ifaceName)
		}
	}

}

func deviceExists(name string) bool {
	devices, err := pcap.FindAllDevs()

	if err != nil {
		log.Panic(err)
	}

	for _, device := range devices {
		if device.Name == name {
			return true
		}
	}
	return false
}
