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
	"log"
	"os"
	"strings"
	"time"

	"github.com/spr-networks/sprbus"
)

var ServerEventSock = "/state/plugins/packet_logs/server.sock"

func sprServer() {
	fmt.Println("starting sprbus...")
	_, err := sprbus.NewServer(ServerEventSock)
	if err != nil {
		log.Fatal(err)
	}
}

// this is to get strings for mac addrs instead of raw
type PacketEthernet struct {
	SrcMAC string
	DstMAC string
}

//new format
type PacketInfo struct {
	//Ethernet  *PacketEthernet `json:"Ethernet,omitempty"`
	TCP    *layers.TCP  `json:"TCP,omitempty"`
	UDP    *layers.UDP  `json:"UDP,omitempty"`
	IPv4   *layers.IPv4 `json:"IP,omitempty"`
	DNS    *layers.DNS  `json:"DNS,omitempty"`
	Prefix string       `json:"Prefix"`
}

//current format
type NetfilterInfo struct {
	Timestamp  string `json:"timestamp"`
	SrcIp      string `json:"src_ip"`
	SrcPort    int    `json:"src_port"`
	DestIp     string `json:"dest_ip"`
	DestPort   int    `json:"dest_port"`
	Prefix     string `json:"oob.prefix"`
	IpProtocol int    `json:"ip.protocol"`
	Action     string `json:"action"`
}

func main() {

	go sprServer()

	client, err := sprbus.NewClient(ServerEventSock)
	defer client.Close()

	if err != nil {
		log.Fatal("err", err)
	}

	fmt.Println("sprbus client connected")

	NetfilterGroup := 0 // 0 = allow, 1 = deny

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

	ctx, cancel := context.WithTimeout(context.Background(), 60*60*time.Second)
	defer cancel()

	hook := func(attrs nflog.Attribute) int {
		//var eth layers.Ethernet
		var ip4 layers.IPv4
		var tcp layers.TCP
		var udp layers.UDP
		var dns layers.DNS

		result := PacketInfo{Prefix: *attrs.Prefix}
		res := NetfilterInfo{Prefix: *attrs.Prefix}
		res.Timestamp = fmt.Sprintf("%s", attrs.Timestamp)
		res.Action = "allowed"
		if NetfilterGroup == 1 {
			res.Action = "blocked"
		}

		//TLDR: DecodingLayerParser takes about 10% of the time as NewPacket to decode packet data, but only for known packet stacks.
		parser := gopacket.NewDecodingLayerParser(layers.LayerTypeIPv4, &ip4, &tcp, &udp, &dns)
		decoded := []gopacket.LayerType{}
		packetData := *attrs.Payload
		if err := parser.DecodeLayers(packetData, &decoded); err != nil {
			fmt.Fprintf(os.Stderr, "packet parse error: %v\n", err)
			return 0
		}

		// iterate to see what layer we have
		for _, layerType := range decoded {
			switch layerType {
			/*case layers.LayerTypeEthernet:
			var ethd PacketEthernet
			ethd.SrcMAC = fmt.Sprintf("%v", eth.SrcMAC)
			ethd.DstMAC = fmt.Sprintf("%v", eth.DstMAC)
			result.Ethernet = &ethd
			*/
			case layers.LayerTypeIPv4:
				result.IPv4 = &ip4

				res.SrcIp = fmt.Sprintf("%s", ip4.SrcIP)
				res.DestIp = fmt.Sprintf("%s", ip4.DstIP)
			case layers.LayerTypeTCP:
				result.TCP = &tcp

				res.SrcPort = int(tcp.SrcPort)
				res.DestPort = int(tcp.DstPort)
				res.IpProtocol = 6
			case layers.LayerTypeUDP:
				result.UDP = &udp

				res.SrcPort = int(udp.SrcPort)
				res.DestPort = int(udp.DstPort)
				res.IpProtocol = 17
			case layers.LayerTypeDNS:
				result.DNS = &dns
			}
		}

		//data, err := json.Marshal(result)
		data, err := json.Marshal(res)
		if err != nil {
			fmt.Fprintf(os.Stderr, "json error:", err)
			return 0
		}

		//send to sprbus
		fmt.Printf("##pub: %v\n", string(data))

		//registeredPrefix := regexp.MustCompile(`^(lan|wan|drop):(in|out|forward|input|mac|pfw)$`).MatchString
		prefix := strings.TrimSpace(strings.ToLower(res.Prefix))
		topic := fmt.Sprintf("nft:%s", prefix)

		client.Publish(topic, string(data))

		return 0
	}

	errFunc := func(e error) int {
		fmt.Fprintf(os.Stderr, "hook error: %v", e)
		return 0
	}

	// Register your function to listen on nflog group 100
	err = nf.RegisterWithErrorFunc(ctx, hook, errFunc)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to register hook function: %v", err)
		return
	}

	// Block till the context expires
	<-ctx.Done()
}
