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

func lanIn(json string) {
	fmt.Printf("[lan <<] %v", json)
}

func lanOut(json string) {
	fmt.Printf("[lan >>] %v", json)
}

func wanIn(json string) {
	fmt.Printf("[wan <<] %v", json)
}

func wanOut(json string) {
	fmt.Printf("[wan >>] %v", json)
}

func dropInput(json string) {
	fmt.Printf("[drop input] %v\n", json)
}

func dropForward(json string) {
	fmt.Printf("[drop forward] %v\n", json)
}

func ipConnect(json string) {
	fmt.Printf("[ip] %v", json)
}

/* TODO wrap parts of this logic in a package so we can have:

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

	// if file exitst - could be another client connected
	os.Remove(ClientEventSock)
	defer os.Remove(ClientEventSock)

	rpcClient, err := rpc.DialHTTPPath("unix", ServerEventSock, ServerEventPath)
	if (rpcClient == nil) {
		log.Fatal(err)
		return
	}

	log.Println("client")

	client := EventBus.NewClient(ClientEventSock, ClientEventPath, EventBus.New())
	client.Start()

	log.Println("subscribe")
	//client.Subscribe("nft:ip", ipConnect, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:lan:in", lanIn, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:lan:out", lanOut, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:wan:in", wanIn, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:wan:out", wanOut, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:drop:input", dropInput, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:drop:forward", dropForward, ServerEventSock, ServerEventPath)

	/*
	simplify the logic here to:
	sprbus = SprBus.NewClient()
	sprbus.Subscribe("nft:lan:in", lanIn)
	*/

	for i := 0; i < 5; i++{
	//for {
		//fmt.Println("sleeping...")
		time.Sleep(1 * time.Second)
	}

/*
	log.Println("unsub.")
	err = client.EventBus().Unsubscribe("nft:lan:in", lanIn)
	log.Println("unsub. ret", err)
	err = client.EventBus().Unsubscribe("nft:lan:out", lanOut)
	err = client.EventBus().Unsubscribe("nft:wan:in", wanIn)
	err = client.EventBus().Unsubscribe("nft:wan:out", wanOut)
	err = client.EventBus().Unsubscribe("nft:drop:input", dropInput)
	err = client.EventBus().Unsubscribe("nft:drop:forward", dropForward)
	log.Println("unsub. ret", err)
*/

	//defer networkBus.Stop()
	defer client.Stop()
}
