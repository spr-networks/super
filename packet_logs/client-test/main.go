package main

/*
this is a test client that subscribe to events from ulogd
and prints out log message depending on log prefix from netfilter

this example will get logs from eventbus and match udp/dns packets
with lookups matching specified regexp.

see for layer info:
https://pkg.go.dev/github.com/google/gopacket/layers#DNS

can use a third arg being default, if specifed is sent to a client

*/

import (
	"encoding/json"
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

type ConditionEntry struct {
	Prefix   string `json:"Prefix"`
	Protocol string `json:"Protocol"`
	DstIP    string `json:"DstIP"`
	DstPort  int    `json:"DstPort"`
	SrcIP    string `json:"SrcIP"`
	SrcPort  int    `json:"SrcPort"`
	//DomainNames     []string `json:"DomainNames"`
}

func logTraffic(topic string, data string) {
	//var logEntry map[string]interface{}
	var logEntry PacketInfo
	if err := json.Unmarshal([]byte(data), &logEntry); err != nil {
		log.Fatal(err)
	}

	fmt.Printf("## traffic: %v @ %v\n", topic, logEntry.Timestamp)

	if logEntry.InDev != "" {
		fmt.Printf("## InDev: %v\n", logEntry.InDev)
	}

	if logEntry.OutDev != "" {
		fmt.Printf("## OutDev: %v\n", logEntry.OutDev)
	}

	/*
		jsondata := `{"Prefix": "test", "DomainNames": ["abctest1234.com"] }`
		var cond ConditionEntry
		if err := json.Unmarshal([]byte(jsondata), &cond); err != nil {
			  log.Fatal(err)
		}
	*/

	/*
		if logEntry.UDP != nil && logEntry.DNS != nil && len(logEntry.DNS.Questions) > 0 {
			//fmt.Printf("## DNS:\n%v\n", logEntry.DNS)

			//dump all A *.org domain lookups
			r, _ := regexp.Compile("([a-z]+).org")
			matchDomainName := r.MatchString(fmt.Sprintf("%s", logEntry.DNS.Questions[0].Name))

			//log everything
			//fmt.Printf(">> %s:%s . match=%v\n", logEntry.DNS.Questions[0].Type, logEntry.DNS.Questions[0].Name, matchDomainName)

			// only Type A for now
			DNSType := "A"

			if fmt.Sprintf("%s", logEntry.DNS.Questions[0].Type) == DNSType && matchDomainName {
				fmt.Printf(">> type: %s\tname: \"%s\"\n",
					logEntry.DNS.Questions[0].Type,
					logEntry.DNS.Questions[0].Name)
				//fmt.Printf("%v\n", data)
			}
		}
	*/
}

func main() {
	client, err := sprbus.NewClient(ServerEventSock)
	defer client.Close()

	if err != nil {
		log.Fatal("err", err)
	}

	fmt.Println("client connected:", client)

	stream, err := client.SubscribeTopic("nft:") // NOTE need to end with :
	if nil != err {
		log.Fatal(err)
	}

	go func() {
		fmt.Println("recv")
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

	time.Sleep(60 * time.Second)
}
