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
	"sync"
	"time"

	"github.com/spr-networks/sprbus"
)

var ServerEventSock = "/state/api/eventbus.sock"

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
	TCP       *layers.TCP    `json:"TCP,omitempty"`
	UDP       *layers.UDP    `json:"UDP,omitempty"`
	IP        *layers.IPv4   `json:"IP,omitempty"`
	DNS       *layers.DNS    `json:"DNS,omitempty"`
	DHCP      *layers.DHCPv4 `json:"DHCP,omitempty"`
	Prefix    string         `json:"Prefix"`
	Action    string         `json:"Action"`
	Timestamp time.Time      `json:"Timestamp"`
}

var wg sync.WaitGroup

func main() {
	wg.Add(1)

	go sprServer()

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
		//var eth layers.Ethernet
		var ip4 layers.IPv4
		var tcp layers.TCP
		var udp layers.UDP
		var dns layers.DNS
		var dhcp layers.DHCPv4

		result := PacketInfo{Prefix: *attrs.Prefix, Timestamp: *attrs.Timestamp}
		result.Action = "allowed"
		if NetfilterGroup == 1 {
			result.Action = "blocked"
		}

		// DecodingLayerParser takes about 10% of the time as NewPacket to decode packet data, but only for known packet stacks.
		parser := gopacket.NewDecodingLayerParser(layers.LayerTypeIPv4, &ip4, &tcp, &udp, &dns, &dhcp)
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

		data, err := json.Marshal(result)
		if err != nil {
			fmt.Fprintf(os.Stderr, "json error:", err)
			return 0
		}

		//send to sprbus

		//registeredPrefix := regexp.MustCompile(`^(lan|wan|drop):(in|out|forward|input|mac|pfw)$`).MatchString
		prefix := strings.TrimSpace(strings.ToLower(result.Prefix))
		topic := fmt.Sprintf("nft:%s", prefix)

		//fmt.Printf("##pub: %v\n%v\n", topic, string(data))
		fmt.Printf("##pub: %v\n", topic)

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
