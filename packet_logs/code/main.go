package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"regexp"
	"strings"

	//"github.com/spr-networks/EventBus"
	//"main/EventBus"
)

var pipeFile = "/state/plugins/packet_logs/ulogd.json"

type nftEntry struct {
	//Timestamp 	time.Time	`json:"timestamp"`
	//TODO cannot parse "+0200\"" as
	Timestamp    string `json:"timestamp"`
	Action       string `json:"action"`
	InterfaceIn  string `json:"oob.in"`
	InterfaceOut string `json:"oob.out"`
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

	log.Println("open ulogd named pipe for reading")
	file, err := os.OpenFile(pipeFile, os.O_RDONLY, os.ModeNamedPipe)
	if err != nil {
		log.Fatal("open error:", err)
	}

	server := SprBus()

	reader := bufio.NewReader(file)

	log.Println("entering main loop")

	for {
		line, err := reader.ReadBytes('\n')
		if err != nil {
			log.Println("read error:", err)
			continue
		}

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

		registeredPrefix := regexp.MustCompile(`^(lan|wan|drop):(in|out|forward|input|mac|pfw)$`).MatchString

		topic := fmt.Sprintf("nft:%s", prefix)

		if registeredPrefix(prefix) {
			//fmt.Printf("%% publish. #subscribers: %d, hasClients= %v\n", len(server.Subscribers(topic)), hasClients)
			//log.Printf("subscribers: %v == %v\n", topic, server)

			server.Publish(topic, string(line))
		} else {
			topic = fmt.Sprintf("nft:ip")
			server.Publish(topic, string(line))
		}
	}

	defer server.Stop()
}
