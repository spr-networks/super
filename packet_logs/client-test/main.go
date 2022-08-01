package main
/*
this is a test client that subscribe to events from ulogd
and prints out log message depending on log prefix from netfilter

code will be moved to api / websocket for sending out notifications
depending on settings

 TODO wrap parts of this logic in a package so we can have:

sprEvent.Subscribe("nft:ip", ipConnect)
sprEvent.Publish("nft:ip", "{ json ... }")

can use a third arg being default, if specifed is sent to a client
*/

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"
	"strings"
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

//notification_settings.json is array of this:
type SettingEntry struct {
	Conditions map[string]interface{}	`json:"conditions"`
	SendNotification bool			`json:"notification"`
	// could have templates: notificationTitle, notificationBody with ${dest_ip}
}
/* example:
[
	{
		conditions: { "prefix": "nft:wan:out", "src_ip": "192.168.2.18", "dest_ip": "8.8.8.8" },
		notification: true
	}
]
*/

var NotificationSettings = []SettingEntry{}

func lanIn(data string) {
	fmt.Printf("[lan <<] %v", data)
}

func lanOut(data string) {
	fmt.Printf("[lan >>] %v", data)
}

func checkNotificationTraffic(rawEntry map[string]interface{}) bool {
	// add nft prefix + remove extra whitespace from logs
	prefix := strings.TrimSpace(fmt.Sprintf("nft:%v", rawEntry["oob.prefix"]))

	for idx, setting := range NotificationSettings {
		if setting.SendNotification != true {
			continue
		}

		shouldNotify := true
		for key, value := range setting.Conditions {
			valueEntry := fmt.Sprintf("%v", rawEntry[key])
			if key == "prefix" { 
				valueEntry = prefix
			}

			// TODO sprintf for string vs. int
			if valueEntry != fmt.Sprintf("%v", value) {
				shouldNotify = false
				break
			}
		}

		if shouldNotify {
			return true
		}
	}

	return false
}

func wanTraffic(data string) {
	// use json layout for matching
	var rawEntry map[string]interface{}
	if err := json.Unmarshal([]byte(data), &rawEntry); err != nil {
		  log.Fatal(err)
	}

	fmt.Printf("## %s\n", rawEntry["timestamp"])

	shouldNotify := checkNotificationTraffic(rawEntry)
	if shouldNotify {
		fmt.Printf("!! Send Notification\n")
		// send notification
	}
}

func dropInput(data string) {
	fmt.Printf("[drop input] %v\n", data)
}

func dropForward(data string) {
	fmt.Printf("[drop forward] %v\n", data)
}

func ipConnect(data string) {
	fmt.Printf("[ip] %v", data)
}

// NOTE reload on update
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
	client.Subscribe("nft:lan:in", lanIn, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:lan:out", lanOut, ServerEventSock, ServerEventPath)

	client.Subscribe("nft:drop:input", wanTraffic, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:drop:forward", wanTraffic, ServerEventSock, ServerEventPath)

	client.Subscribe("nft:wan:in", wanTraffic, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:wan:out", wanTraffic, ServerEventSock, ServerEventPath)

	/*
	simplify the logic here to:
	sprbus = SprBus.NewClient()
	sprbus.Subscribe("nft:lan:in", lanIn)
	*/

	for i := 0; i < 20; i++{
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
