package main

/*

see README.md

see for layer info:
https://pkg.go.dev/github.com/google/gopacket/layers#DNS

*/

import (
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	//"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/gopacket/layers"
	"github.com/influxdata/influxdb-client-go/v2"
	"github.com/spr-networks/sprbus"
)

var ServerEventSock = "/state/api/eventbus.sock"

var wg sync.WaitGroup

var IFDB influxdb2.Client = nil

type InfluxConfig struct {
	URL    string
	Org    string
	Bucket string // NOTE not used
	Token  string
}

type APIConfig struct {
	InfluxDB InfluxConfig
	//Plugins   []interface{}
	//PlusToken string
}

var ApiConfigPath = "/configs/base/api.json"
var config = APIConfig{}

func loadConfig() {
	data, err := ioutil.ReadFile(ApiConfigPath)
	if err != nil {
		fmt.Println(err)
	} else {
		err = json.Unmarshal(data, &config)
		if err != nil {
			fmt.Println(err)
		}
	}
}

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
}

func logTraffic(topic string, data string) {
	var logEntry PacketInfo
	if err := json.Unmarshal([]byte(data), &logEntry); err != nil {
		log.Fatal(err)
	}

	logEntry.Prefix = strings.TrimSpace(logEntry.Prefix)

	log.Printf(">> %v @ %v\n", topic, logEntry.Timestamp)
	log.Printf(">> %v => %v\n", logEntry.IP.SrcIP, logEntry.IP.DstIP)

	if IFDB == nil {
		log.Println("missing influxdb??")
		return
	}

	org := "spr"
	if config.InfluxDB.Org != "" {
		org = config.InfluxDB.Org
	}

	bucket := "spr" // use spr bucket only
	if config.InfluxDB.Bucket != "" {
		bucket = config.InfluxDB.Bucket
	}
	/*
		bucket := strings.Replace(topic, "nft:", "", -1) // => prefix rule
		validBucket := regexp.MustCompile(`^(lan|wan|drop):(in|out|forward|input|mac|pfw)$`).MatchString
		if !validBucket(bucket) {
			log.Println("invalid bucket, using default")
			bucket = "spr"
		}
	*/

	writeAPI := IFDB.WriteAPI(org, bucket)
	//writeAPI.WriteRecord(fmt.Sprintf("thermostat,unit=temperature,user=%s avg=%f,max=%f", t.user, t.avg, t.max))

	log.Printf("## prefix= %s, bucket=%s, action=%s\n", logEntry.Prefix, bucket, logEntry.Action)

	/*
		NOTES on tags vs. fields in InfluxDB:

		"A rule of thumb would be to persist highly dynamic values as fields and only use tags for GROUP BY clauses and InfluxQL functions, carefully designing your application around it."

		we use tags for prefix, src/dst ip, rest is fields
	*/

	if logEntry.TCP != nil {
		p := influxdb2.NewPointWithMeasurement("tcp").
			AddTag("Prefix", logEntry.Prefix).
			AddTag("Action", logEntry.Action).
			AddTag("SrcIP", fmt.Sprintf("%v", logEntry.IP.SrcIP)).
			AddTag("DstIP", fmt.Sprintf("%v", logEntry.IP.DstIP)).
			AddField("Length", logEntry.IP.Length).
			AddField("SrcPort", logEntry.TCP.SrcPort).
			AddField("DstPort", logEntry.TCP.DstPort).
			AddField("Checksum", logEntry.TCP.Checksum).
			SetTime(logEntry.Timestamp)

		writeAPI.WritePoint(p)
		writeAPI.Flush()
	} else if logEntry.UDP != nil {
		p := influxdb2.NewPointWithMeasurement("udp").
			AddTag("Prefix", logEntry.Prefix).
			AddTag("Action", logEntry.Action).
			AddTag("SrcIP", fmt.Sprintf("%v", logEntry.IP.SrcIP)).
			AddTag("DstIP", fmt.Sprintf("%v", logEntry.IP.DstIP)).
			AddField("Length", logEntry.IP.Length).
			AddField("SrcPort", logEntry.UDP.SrcPort).
			AddField("DstPort", logEntry.UDP.DstPort).
			//AddField("UDP.Length", logEntry.UDP.Length).
			AddField("Checksum", logEntry.UDP.Checksum).
			SetTime(logEntry.Timestamp)

		if logEntry.DNS != nil && len(logEntry.DNS.Questions) > 0 {
			//write one entry for each q
			for _, q := range logEntry.DNS.Questions {
				//log.Printf(">> DNS %s, %s\n", q.Type, q.Name)
				p.AddField("DNS.Type", fmt.Sprintf("%s", q.Type)).
					AddField("DNS.Name", fmt.Sprintf("%s", q.Name)).
					AddField("DNS.ID", logEntry.DNS.ID)

				writeAPI.WritePoint(p)
				writeAPI.Flush()
			}
		} else {
			writeAPI.WritePoint(p)
			writeAPI.Flush()
		}
	} else {
		p := influxdb2.NewPointWithMeasurement("ip").
			AddTag("Prefix", logEntry.Prefix).
			AddTag("Action", logEntry.Action).
			AddTag("SrcIP", fmt.Sprintf("%v", logEntry.IP.SrcIP)).
			AddTag("DstIP", fmt.Sprintf("%v", logEntry.IP.DstIP)).
			AddField("Length", logEntry.IP.Length).
			SetTime(logEntry.Timestamp)

		writeAPI.WritePoint(p)
		writeAPI.Flush()
	}
}

func main() {
	loadConfig()
	// setup influxdb

	url := "http://localhost:8086"
	if config.InfluxDB.URL != "" {
		url = config.InfluxDB.URL
	}

	token := ""
	if config.InfluxDB.Token != "" {
		token = config.InfluxDB.Token
	}

	IFDB = influxdb2.NewClient(url, token)
	log.Println("influxdb connected")

	client, err := sprbus.NewClient(ServerEventSock)
	defer client.Close()

	if err != nil {
		log.Fatal(err)
	}

	log.Println("sprbus client connected")

	//stream, err := client.SubscribeTopic("nft:lan:out:")
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
				log.Fatal("sprbus error:", err) // Cancelled desc
			}

			topic := reply.GetTopic()
			value := reply.GetValue()

			// wildcard sub - value is topic+value
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
