package main

/*
this is a test client that subscribe to events from packet_logs,
printing all logs to stdout for storing/exporting logs.

see for layer info:
https://pkg.go.dev/github.com/google/gopacket/layers#DNS
*/

import (
	//"encoding/json"
	"fmt"
	"io"
	"log"
	//"regexp"
	"strings"
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
	client, err := sprbus.NewClient(ServerEventSock)
	defer client.Close()

	if err != nil {
		log.Fatal("err", err)
	}

	stream, err := client.SubscribeTopic("nft:") // NOTE need to end with :
	if nil != err {
		log.Fatal(err)
	}

	go func() {
		wg.Add(1)

		for {
			reply, err := stream.Recv()
			if io.EOF == err {
				break
			}

			if nil != err {
				log.Fatal("ERRRRRR ", err) // Cancelled desc
			}

			topic := reply.GetTopic()
			value := reply.GetValue()
			index := strings.Index(value, "{")
			if index <= 0 {
				continue
			}

			topic = value[0 : index-1]
			value = value[index:len(value)]

			logTraffic(topic, value)
		}
	}()

	time.Sleep(time.Second)
	wg.Wait()
}
