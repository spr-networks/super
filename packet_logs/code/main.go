package main

// sample daemon to behave like ulogd, publish notifcations to sprbus
// NOTE only log group = 0 (= allow) for now, change NetfilterGroup to 1 for deny

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/florianl/go-nflog/v2"
	"github.com/google/gopacket"
	"github.com/google/gopacket/layers"
	"github.com/spr-networks/sprbus"
	"log"
	"os"
	"strings"
	"sync"
	"time"
)

var ServerEventSock = "/state/api/eventbus.sock"

// this is to get strings for mac addrs instead of raw
type PacketEthernet struct {
	SrcMAC string
	DstMAC string
	HwType uint16
}

// new format
type PacketInfo struct {
	Ethernet        *PacketEthernet `json:"Ethernet,omitempty"`
	TCP             *layers.TCP     `json:"TCP,omitempty"`
	UDP             *layers.UDP     `json:"UDP,omitempty"`
	IP              *layers.IPv4    `json:"IP,omitempty"`
	DNS             *layers.DNS     `json:"DNS,omitempty"`
	DHCP            *layers.DHCPv4  `json:"DHCP,omitempty"`
	RecentDomainSrc string          `json:"RecentDomainSrc,omitempty"`
	RecentDomainDst string          `json:"RecentDomainDst,omitempty"`
	Prefix          string          `json:"Prefix"`
	Action          string          `json:"Action"`
	Timestamp       time.Time       `json:"Timestamp"`
	InDev           string          `json:"InDev"`
	OutDev          string          `json:"OutDev"`
}

var wg sync.WaitGroup
var interfaceMap *InterfaceMap
var gDebug = os.Getenv("DEBUG") != ""

func main() {
	interfaceMap = NewInterfaceMap()

	busListener()

	client, err := sprbus.NewClient(ServerEventSock)
	defer client.Close()

	if err != nil {
		log.Fatal("err", err)
	}

	fmt.Println("sprbus client connected")

	wg.Add(2)

	// one thread for each netfilter group
	go logGroup(client, 0)
	go logGroup(client, 1)

	wg.Wait()

	fmt.Printf("exit\n")
}

var verboseLog = false

func logGroup(client *sprbus.Client, NetfilterGroup int) {
	config := nflog.Config{
		Group:    uint16(NetfilterGroup),
		Copymode: nflog.CopyPacket,
	}

	nf, err := nflog.Open(&config)
	if err != nil {
		log.Fatal("could not open nflog socket:", err)
		return
	}
	defer nf.Close()

	//ctx, cancel := context.WithTimeout(context.Background(), 60*60*time.Second)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	hook := func(attrs nflog.Attribute) int {
		var ip4 layers.IPv4
		var tcp layers.TCP
		var udp layers.UDP
		var dns layers.DNS
		var dhcp layers.DHCPv4

		result := PacketInfo{Prefix: *attrs.Prefix}

		// Try to use timestamp attribute, otherwise grab current time
		if attrs.Timestamp != nil {
			result.Timestamp = *attrs.Timestamp
		} else {
			result.Timestamp = time.Now()
		}

		// get devices
		if attrs.InDev != nil {
			iface := interfaceMap.GetInterfaceName(int(*attrs.InDev))
			if iface != "" {
				result.InDev = iface
			}
		}

		if attrs.OutDev != nil {
			iface := interfaceMap.GetInterfaceName(int(*attrs.OutDev))
			if iface != "" {
				result.OutDev = iface
			}
		}

		result.Action = "allowed"
		if NetfilterGroup == 1 {
			result.Action = "blocked"
		}

		//TBD ipv6

		// DecodingLayerParser takes about 10% of the time as NewPacket to decode packet data, but only for known packet stacks.
		parser := gopacket.NewDecodingLayerParser(layers.LayerTypeIPv4, &ip4, &tcp, &udp, &dns, &dhcp)
		decoded := []gopacket.LayerType{}
		packetData := *attrs.Payload
		if err := parser.DecodeLayers(packetData, &decoded); err != nil {
			if verboseLog {
				fmt.Fprintf(os.Stderr, "packet parse error: %v\n", err)
			}
			return 0
		}

		// iterate to see what layer we have
		for _, layerType := range decoded {
			switch layerType {
			case layers.LayerTypeIPv4:
				result.IP = &ip4
			case layers.LayerTypeTCP:
				result.TCP = &tcp
			case layers.LayerTypeUDP:
				result.UDP = &udp
			case layers.LayerTypeDNS:
				result.DNS = &dns
			case layers.LayerTypeDHCPv4:
				result.DHCP = &dhcp
			}
		}

		var ethd PacketEthernet

		ethd.HwType = *attrs.HwType
		if ethd.HwType == 1 {

			if attrs.HwHeader != nil && len(*attrs.HwHeader) >= 12 {
				hwHeader := *attrs.HwHeader
				dstMAC := hwHeader[:6]
				srcMAC := hwHeader[6:12]
				ethd.DstMAC = fmt.Sprintf("%02x:%02x:%02x:%02x:%02x:%02x", dstMAC[0], dstMAC[1], dstMAC[2], dstMAC[3], dstMAC[4], dstMAC[5])
				ethd.SrcMAC = fmt.Sprintf("%02x:%02x:%02x:%02x:%02x:%02x", srcMAC[0], srcMAC[1], srcMAC[2], srcMAC[3], srcMAC[4], srcMAC[5])
			}
		}
		result.Ethernet = &ethd

		//populate RecentDomain based on IPs
		DNSCachemtx.RLock()
		if result.IP != nil {
			src_domain, exists := DNSCache[result.IP.SrcIP.String()]
			if exists {
				result.RecentDomainSrc = src_domain
			}
			dst_domain, exists := DNSCache[result.IP.DstIP.String()]
			if exists {
				result.RecentDomainDst = dst_domain
			}

		}
		DNSCachemtx.RUnlock()

		data, err := json.Marshal(result)
		if err != nil {
			fmt.Fprintf(os.Stderr, "json error: %v", err)
			return 0
		}

		//send to sprbus

		//registeredPrefix := regexp.MustCompile(`^(lan|wan|drop):(in|out|forward|input|mac|pfw)$`).MatchString
		prefix := strings.TrimSpace(strings.ToLower(result.Prefix))
		topic := fmt.Sprintf("nft:%s", prefix)

		if verboseLog {
			//fmt.Printf("##pub: %v\n%v\n", topic, string(data))
			fmt.Printf("##pub: %v\n", topic)
		}

		client.Publish(topic, string(data))

		return 0
	}

	errFunc := func(e error) int {
		fmt.Fprintf(os.Stderr, "hook error: %v", e)
		return 0
	}

	// Register function to listen on nflog group
	err = nf.RegisterWithErrorFunc(ctx, hook, errFunc)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to register hook function: %v", err)
		return
	}

	// Block till the context expires
	<-ctx.Done()
}
