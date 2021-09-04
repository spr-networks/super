package main

import (
	//	"bytes"
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"log"
	"net"
	"os"
	"strconv"
	"strings"
	"time"
  "sync"

	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/google/gopacket/pcap"

	"github.com/vishvananda/netlink"
	"golang.org/x/sys/unix"

	"github.com/dreadl0ck/ja3"

  "crawshaw.io/sqlite/sqlitex"
  "crawshaw.io/sqlite"

)

var SPool *sqlitex.Pool

//sqlite3 is too inefficient for packet processing (pegs CPU swiftly), so use an in memory cache

type eKey struct {
  srcId int64
  endpointType gopacket.EndpointType
  rawval [16]byte
}
type eVal struct {
  t time.Time
  srcId int64
  endpointType gopacket.EndpointType
  rawval [16]byte
}

//TBD, m/v/inc_id can all be maps of maps by types
type EndpointMap struct {
  sync.RWMutex
  m map[gopacket.EndpointType]map[eKey]int64
  v map[gopacket.EndpointType]map[int64]eVal
  i map[gopacket.EndpointType]int64
}


var eMap EndpointMap

type fKey struct {
  srcId int64
  parentId int64
  aId int64
  bId int64
}
type fVal struct {
  t time.Time
  layerType int
  srcId int64
  parentId int64
  aId int64
  bId int64
}

type FlowMap struct {
  sync.RWMutex
  m map[gopacket.LayerType]map[fKey]int64
  v map[gopacket.LayerType]map[int64]fVal
  i map[gopacket.LayerType]int64
}

var fMap FlowMap

var EPHEMERAL_WILDCARD_PORT_ID = int64(-1000);



func InitDB(filepath string) *sqlitex.Pool {
	db, err := sqlitex.Open(filepath, 0, 16)
	if err != nil {
		panic(err)
	}
	if db == nil {
		panic("db nil")
	}
	return db
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

func findOrSaveInterface(ifaceNameTarget string) int64 {

	//shrink down the vif naming for the sqlite db since clients are not assigned
	// a fixed VIF
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

	var primaryAddress = ""

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

	fmt.Println("looking up interface", ifaceName, iface.HardwareAddr, hostname, primaryAddress)

	hardwareAddr := iface.HardwareAddr
	  if hardwareAddr == nil {
		hardwareAddr = []byte{0, 0, 0, 0, 0, 0}
	}

	sql_query_endpoint := `SELECT id FROM datasources WHERE interfaceName=? AND hardwareAddress=? AND hostName=? AND primaryAddress=?`

  S := SPool.Get(nil)
  defer SPool.Put(S)

	var (
		id int64
	)

  id = -1
  fn := func(stmt *sqlite.Stmt) error {
    id = stmt.ColumnInt64(0)
    return nil
	}
	err = sqlitex.Exec(S, sql_query_endpoint, fn, ifaceName, hardwareAddr, hostname, primaryAddress)
	if err != nil {
		log.Fatal(err)
	}

  if id != -1 {
    return id
  }

	//not found, so insert it
  err = sqlitex.Exec(S, "INSERT INTO datasources(interfaceName, hardwareAddress, hostName, primaryAddress) VALUES(?, ?, ?, ?)", nil, ifaceName, hardwareAddr, hostname, primaryAddress)
	if err != nil {
		log.Fatal(err)
	}

	lastId := S.LastInsertRowID()

	fmt.Println("saved new interface", ifaceName, hardwareAddr, hostname, primaryAddress)

	return lastId

}

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

	count := 0
	for packet := range source.Packets() {
		saveFlows(iface, iface_id, packet)
		count++
	}
	debugPrint(2, "total", count)
}

func main() {
	debugPrint(2, "--= Flow capture =--")

  //beware -> registering new endpoint and layer types needs the hot maps updated

  eMap = EndpointMap{ m: make(map[gopacket.EndpointType]map[eKey]int64),
                      v: make(map[gopacket.EndpointType]map[int64]eVal),
                      i: make(map[gopacket.EndpointType]int64) }

  fMap = FlowMap{ m: make(map[gopacket.LayerType]map[fKey]int64),
                  v: make(map[gopacket.LayerType]map[int64]fVal),
                  i: make(map[gopacket.LayerType]int64) }

  for val := 0; val <= 1000; val++ {
    eMap.m[gopacket.EndpointType(val)] = make(map[eKey]int64)
    eMap.v[gopacket.EndpointType(val)] = make(map[int64]eVal)
    fMap.m[gopacket.LayerType(val)] = make(map[fKey]int64)
    fMap.v[gopacket.LayerType(val)] = make(map[int64]fVal)
  }

	SPool = InitDB("flowgather.db")

	establishInterfaces()

	listenNewInterfaceUp(listenInterface)

}

func handlePayload(payload gopacket.Payload, packet gopacket.Packet, dstPort int, parentBiflowId int64) {
	//try to decode as TLS
	var tls layers.TLS
	var decoded []gopacket.LayerType
	parser := gopacket.NewDecodingLayerParser(layers.LayerTypeTLS, &tls)
	err := parser.DecodeLayers(packet.ApplicationLayer().LayerContents(), &decoded)
	if err == nil {
		for _, layerType := range decoded {
			switch layerType {
			case layers.LayerTypeTLS:
				// do things with tls variable
				for _, handshake := range tls.Handshake {
					if handshake.ContentType == layers.TLSHandshake {
						clientFingerprint := string(ja3.BarePacket(packet))
						serverFingerprint := string(ja3.BarePacketJa3s(packet))

						if clientFingerprint != "" {
							sum := md5.Sum([]byte(clientFingerprint))
							md5 := hex.EncodeToString(sum[:])
              S := SPool.Get(nil)
							err := sqlitex.Exec(S, "INSERT INTO tlsClientFingerprints(parentBiflowId, fingerprint, fingerprintMD5) VALUES(?, ?, ?)", nil, parentBiflowId, clientFingerprint, md5)
							if err != nil {
								log.Fatal(err)
							}

              SPool.Put(S)

						}

						if serverFingerprint != "" {
							sum := md5.Sum([]byte(serverFingerprint))
							md5 := hex.EncodeToString(sum[:])
              S := SPool.Get(nil)
							err := sqlitex.Exec(S, "INSERT INTO tlsServerFingerprints(parentBiflowId, fingerprint, fingerprintMD5) VALUES(?, ?, ?)", nil, parentBiflowId, serverFingerprint, md5)
							if err != nil {
								log.Fatal(err)
							}
              SPool.Put(S)
						}

					}
				}
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


	//HMMM, do we want to stop periodic queries if the question and response is the same? TBD
  S := SPool.Get(nil)
  defer SPool.Put(S)

	err := sqlitex.Exec(S, "INSERT INTO dnsReplies(parentBiflowId, responseCode, questions, answers) VALUES(?, ?, ?, ?)", nil, parentBiflowId, dns.ResponseCode.String(), questionsString, answersString)
	if err != nil {
		log.Fatal(err)
	}

}

func findOrMakeEndpoint(ifaceId int64, endpoint gopacket.Endpoint, t time.Time, makeEndpoint bool) int64 {
  e_type := endpoint.EndpointType()

  var b16 [16]byte

  if len(endpoint.Raw()) > 16 {
    panic("endpoint too big")
  }
  copy(b16[:], endpoint.Raw())

  eMap.RLock()
  ret, exists := eMap.m[e_type][eKey{ifaceId, e_type, b16}]
  eMap.RUnlock()
  if exists {
    return ret
  }

  if !makeEndpoint {
    return -1
  }

/*
//  if eMap[

	sql_query_endpoint := `SELECT id FROM endpoints WHERE raw=? AND datasrcId=?`

	var (
		id int64
	)

  id = -1
  fn := func(stmt *sqlite.Stmt) error {
    id = stmt.ColumnInt64(0)
    return nil
	}

  S := SPool.Get(nil)
  defer SPool.Put(S)
  err := sqlitex.Exec(S, sql_query_endpoint, fn, endpoint.Raw(), ifaceId)
	if err != nil {
		log.Fatal(err)
	}

  if id != -1 {
    return id
  }

	//not found, so insert it

	err = sqlitex.Exec(S, "INSERT INTO endpoints(datasrcId, type, raw, discoveryTime) VALUES(?, ?, ?, ?)", nil, ifaceId, endpoint.EndpointType(), endpoint.Raw(), t.Format(time.RFC3339))
	if err != nil {
		log.Fatal(err)
	}
*/
//	lastId := S.LastInsertRowID()

  //add to hotmap
  eMap.Lock()
  lastId, _ := eMap.i[e_type]
  eMap.i[e_type] = lastId + 1
  eMap.m[e_type][eKey{ifaceId, endpoint.EndpointType(), b16}] = lastId
  eMap.v[e_type][lastId] = eVal{t, ifaceId, endpoint.EndpointType(), b16}
  eMap.Unlock()

	return lastId
}



func saveFlow(ifaceId int64, layerType int, previous int64, flow gopacket.Flow, t time.Time, srcPort int, dstPort int) int64 {
	//look for it in one direction

	aEid := findOrMakeEndpoint(ifaceId, flow.Src(), t, true)
	bEid := findOrMakeEndpoint(ifaceId, flow.Dst(), t, true)

  l_type := gopacket.LayerType(layerType)

  //check if in fCache
  fMap.RLock()
  ret, exists := fMap.m[l_type][fKey{ifaceId, previous, aEid, bEid}]
  if exists {
    fMap.RUnlock()
    return ret
  }

  ret, exists = fMap.m[l_type][fKey{ifaceId, previous, bEid, aEid}]
  if exists {
    fMap.RUnlock()
    return ret
  }
  fMap.RUnlock()

  fMap.Lock()
  lastId, _ := fMap.i[l_type]
  fMap.i[l_type] = lastId + 1
  fMap.m[l_type][fKey{ifaceId, previous, aEid, bEid}] = lastId
  fMap.v[l_type][lastId] = fVal{t, layerType, ifaceId, previous, aEid, bEid}

  // ephemeral port heuristic support
  if gopacket.LayerType(layerType) == layers.LayerTypeUDP || gopacket.LayerType(layerType) == layers.LayerTypeTCP {
    src_eph, dst_eph := isEphemeralPortPair(srcPort, dstPort)
    if src_eph && !dst_eph {
      fMap.m[l_type][fKey{ifaceId, previous, EPHEMERAL_WILDCARD_PORT_ID, bEid}] = lastId
    } else if !src_eph && dst_eph {
      fMap.m[l_type][fKey{ifaceId, previous, aEid, EPHEMERAL_WILDCARD_PORT_ID}] = lastId
    }
  }

  fMap.Unlock()

  debugPrint(3, "new flow, layerType: ", layerType, "parent ", previous, flow.String(), " [", lastId, "] total")
  return lastId; //dont save anything perf test´

  S := SPool.Get(nil)
  defer SPool.Put(S)

	//check if this flow is already in the db
	sql_query_endpoint := `SELECT id, bidir, aEid FROM biflows WHERE type=? AND (aEid=? AND bEid=? OR bEid=? AND aEid=?)`

	var (
		id int64
    bidir int64
    prevA int64
	)
  id = -1


  fn := func(stmt *sqlite.Stmt) error {
    id = stmt.ColumnInt64(0)
    bidir = stmt.ColumnInt64(1)
    prevA = stmt.ColumnInt64(2)

    return nil
	}

	err := sqlitex.Exec(S, sql_query_endpoint, fn, layerType, aEid, bEid, aEid, bEid)
	if err != nil {
		log.Fatal(err)
	}

  if id != -1 {
		if bidir == 0 && prevA != aEid {
			//if this flow is in the other direction, and it hasnt been seen before, update the biflow to indicate that
			err := sqlitex.Exec(S, "UPDATE biflows SET bidir=1 WHERE id=?", nil, id)
			if err != nil {
				log.Fatal(err)
			}
		}

		return id
  }
	//not found, so insert it fresh
	err = sqlitex.Exec(S, "INSERT INTO biflows(type, aEid, bEid, parentBiflowId, bidir, discoveryTime) VALUES(?, ?, ?, ?, 0, ?)", nil, layerType, aEid, bEid, previous, t)
	if err != nil {
		log.Fatal(err)
	}

	id = S.LastInsertRowID()

	return id
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
  fMap.RLock()
  _, exists := fMap.m[l_type][fKey{ifaceId, previousFlowId, Eid, EPHEMERAL_WILDCARD_PORT_ID}]
  if exists {
    fMap.RUnlock()
    return false
  }

  _, exists = fMap.m[l_type][fKey{ifaceId, previousFlowId, EPHEMERAL_WILDCARD_PORT_ID, Eid}]
  if exists {
    fMap.RUnlock()
    return false
  }
  fMap.RUnlock()

  //if it did not already exist return true
  return true

/*
	//look for an existing udp biflow belonging to parent, which is UDP, and has an aEid or bEid with a matching port.
	// note: this is lazy, there can be some confusion if aEid or bEid got swapped, resulting in information loss
	sql_query_endpoint := `SELECT endpoints.id FROM biflows INNER JOIN endpoints ON aEid=endpoints.id or bEid=endpoints.id WHERE parentBiflowId=? AND biflows.type=? AND endpoints.raw=? LIMIT 1`

	var (
		id int64
	)
  id = -1

  fn := func(stmt *sqlite.Stmt) error {
    id = stmt.ColumnInt64(0)
    return nil
	}

  S := SPool.Get(nil)
  defer SPool.Put(S)
	err := sqlitex.Exec(S, sql_query_endpoint, fn, previousFlowId, udp.LayerType(), rawPort)
	if err != nil {
		log.Fatal(err)
	}

  if id != -1 {
    return false
  }

  return true;
*/
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
	dstPortNum := -1

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
			dstPortNum = int(tcp.DstPort)
		case layers.LayerTypeUDP:
			udp, _ := layer.(*layers.UDP)
			debugPrint(2, layer.LayerType(), udp.TransportFlow())
			if shouldSaveTransportFlowUDP(ifaceId, previousFlowId, udp) {
				previousFlowId = saveTransportFlow(ifaceId, int(layer.LayerType()), previousFlowId, udp.TransportFlow(), t, int(udp.SrcPort), int(udp.DstPort))
			}
			dstPortNum = int(udp.DstPort)
		case layers.LayerTypeDNS:
			dns, _ := layer.(*layers.DNS)
			handleDNS(layer.LayerContents(), packet, dns, previousFlowId)
		/* would need to observe tcp as datagrams...
		case layers.LayerTypeTLS:
			fmt.Println("TLS ???")
			//handleTLS(layer.LayerContents(), packet, tls)
		*/
		case gopacket.LayerTypePayload:
			handlePayload(layer.LayerContents(), packet, dstPortNum, previousFlowId)
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
