package main
/*
this is a test client that subscribe to events from ulogd
and prints out log message depending on log prefix from netfilter

code will be moved to api / websocket for sending out notifications
depending on settings
*/

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"time"
	"net/rpc"

	"github.com/spr-networks/EventBus"
	//"main/EventBus"
)

var NotificationSettingsFile = "/configs/base/notifications.json"

var ServerEventSock = "/state/plugins/packet_logs/server.sock"
var ClientEventSock = "/state/plugins/packet_logs/client.sock"
var ServerEventPath = "/_server_bus_"
var ClientEventPath = "/_client_bus_"

func ipIn(json string) {
	fmt.Printf("[<<] %v", json)
}

func ipOut(json string) {
	fmt.Printf("[>>] %v", json)
}

func ipConnect(json string) {
	fmt.Printf("[ip] %v", json)
}

func ipDrop(json string) {
	fmt.Printf("[drop] %v\n", json)
}

func lanIn(json string) {
	fmt.Printf("[lan] %v\n", json)
}

/* wrap parts of this logic in a package so we can have:

sprEvent.Subscribe("nft:ip", ipConnect)
sprEvent.Publish("nft:ip", "{ json ... }")

can use a third arg being default, if specifed is sent to a client
*/

//notification_settings.json is array of this:
type SettingEntry struct {
	Conditions map[string]string	`json:"conditions"`
	SendNotification bool		`json:"notification"`
	// could have templates: notificationTitle, notificationBody with ${dest_ip}
}
/* example:
[
	{
		conditions: { "prefix": "nft:ip:out", "src_ip": "192.168.2.11", "dest_ip": "8.8.8.8" },
		notification: true
	}
]
*/

var NotificationSettings = []SettingEntry{}

func loadNotificationConfig() {
        data, err := ioutil.ReadFile(NotificationSettingsFile)
        if err != nil {
                fmt.Println(err)
        } else {
                err = json.Unmarshal(data, &NotificationSettings)
                if err != nil {
                        fmt.Println(err)
                }
        }
}

func main() {
	log.Println("server")

	
	loadNotificationConfig()

	log.Printf("settings: %v\n", NotificationSettings[0].Conditions["prefix"])

	os.Remove(ClientEventSock)

	rpcClient, err := rpc.DialHTTPPath("unix", ServerEventSock, ServerEventPath)
	if (rpcClient == nil) {
		log.Fatal(err)
		return
	}


	log.Println("client")

	client := EventBus.NewClient(ClientEventSock, ClientEventPath, EventBus.New())
	client.Start()

	log.Println("subscribe")
	client.Subscribe("nft:ip", ipConnect, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:ip:in", ipIn, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:ip:out", ipOut, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:drp:inp", ipDrop, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:lan:in", lanIn, ServerEventSock, ServerEventPath)

	for {
		//fmt.Println("sleeping...")
		time.Sleep(10 * time.Second)
	}


	//defer networkBus.Stop()
	defer client.Stop()
}
