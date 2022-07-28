package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"net/rpc"
	"regexp"
	"strings"
	//"time"

	"github.com/spr-networks/EventBus"
	//"main/EventBus"
)

//var pipeFile = "/var/log/ulog/ulogd.json"
var pipeFile = "/state/plugins/packet_logs/ulogd.json"

type nftEntry struct {
        //Timestamp 	time.Time	`json:"timestamp"`
	//TODO cannot parse "+0200\"" as
        Timestamp 	string 		`json:"timestamp"`
       	Action	  	string   	`json:"action"`
        InterfaceIn  	string		`json:"oob.in"`
        InterfaceOut  	string 		`json:"oob.out"`
}

// runs in a thread
func startUlogd() {
    cmd := exec.Command("ulogd", "-c", "/etc/ulogd.conf")

    err := cmd.Run()
    if err != nil {
        log.Fatal(err)
    }
}

func main() {
	log.Println("starting ulogd2...")
	go startUlogd()

	log.Println("connecting eventbus")

        serverEventListener := "/state/plugins/packet_logs/server.sock"
        clientEventListener := "/state/plugins/packet_logs/client.sock"

	os.Remove(serverEventListener)

	//server := EventBus.NewServer("localhost:2020", "/_server_bus_", EventBus.New())
	server := EventBus.NewServer(serverEventListener, "/_server_bus_", EventBus.New())
	server.Start()

	log.Println("open ulogd named pipe for reading")
	file, err := os.OpenFile(pipeFile, os.O_RDONLY, os.ModeNamedPipe)
	if err != nil {
		log.Fatal("open error:", err)
	}

	reader := bufio.NewReader(file)

	log.Println("entering main loop")

	for {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			log.Println("read error:", err)
			continue
		}

		//fmt.Println(">> " + string(line))

		var logEntry netfilterEntry
		if err := json.Unmarshal(line, &logEntry); err != nil {
			log.Fatal(err)
		}

		fmt.Printf("## [%v] %v == %v\n", *logEntry.OobPrefix, *logEntry.Timestamp, *logEntry.Action)
		if logEntry.SrcIp != nil && logEntry.DestIp != nil && logEntry.SrcPort != nil && logEntry.DestPort != nil {
			fmt.Printf("## %v:%v -> %v:%v\n", *logEntry.SrcIp, *logEntry.SrcPort, *logEntry.DestIp, *logEntry.DestPort)
		}

		//action := ""
		/*if logEntry.Action != nil {
			action = *logEntry.Action
		}*/

		prefix := ""
		if logEntry.OobPrefix != nil {
			prefix = strings.TrimSpace(strings.ToLower(*logEntry.OobPrefix))
		}

        	registeredPrefix := regexp.MustCompile(`^(ip|drp|lan|wan):(in|out|inp|fwd)$`).MatchString

		// need this check to not crash if client is disconnected when we publish
		//rpcClient, _ := rpc.DialHTTPPath("tcp", ":2025", "/_client_bus_")
		rpcClient, _ := rpc.DialHTTPPath("unix", clientEventListener, "/_client_bus_")
		if (rpcClient != nil) {
			if registeredPrefix(prefix) {
				topic := fmt.Sprintf("nft:%s", prefix)
				//fmt.Printf("[pub] %s\n", topic)
				server.EventBus().Publish(topic, string(line))
			} else {
				topic := fmt.Sprintf("nft:ip") // todo use prefix
				server.EventBus().Publish(topic, string(line))
			}
		}
	}

	defer server.Stop()
}
