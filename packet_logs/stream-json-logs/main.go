package main

/*
this is a test client that subscribe to events from packet_logs,
printing all logs to stdout for storing/exporting logs.

see for layer info:
https://pkg.go.dev/github.com/google/gopacket/layers#DNS
*/

import (
	"fmt"
	"sync"
	"time"

	"github.com/google/gopacket/layers"
	"github.com/spr-networks/sprbus"
)

var ServerEventSock = "/state/api/eventbus.sock"

var wg sync.WaitGroup

//new format for notifications
type PacketInfo struct {
	//Ethernet  *PacketEthernet `json:"Ethernet,omitempty"`
	TCP       *layers.TCP  `json:"TCP,omitempty"`
	UDP       *layers.UDP  `json:"UDP,omitempty"`
	IP        *layers.IPv4 `json:"IP,omitempty"`
	DNS       *layers.DNS  `json:"DNS,omitempty"`
	Prefix    string       `json:"Prefix"`
	Action    string       `json:"Action"`
	Timestamp time.Time    `json:"Timestamp"`
	InDev     string       `json:"InDev"`
	OutDev    string       `json:"OutDev"`
}

func logTraffic(topic string, data string) {
	/*
	var logEntry PacketInfo
	if err := json.Unmarshal([]byte(data), &logEntry); err != nil {
		log.Fatal(err)
	}
	*/
	fmt.Println(data)
}

func main() {
    sprbus.HandleEvent("nft", logTraffic)
	time.Sleep(time.Second)
	wg.Wait()
}
