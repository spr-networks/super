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

TODO api for adding/remove etc. + documentation

GET PUT DELETE /notifications

Condition == netfilterEntry

oob.prefix
timestamp
dest_ip
dest_port
src_ip
src_port

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
	//Conditions map[string]interface{}	`json:"Conditions"`
	Conditions ConditionEntry 		`json:"Conditions"`
	SendNotification bool			`json:"Notification"`
	// could have templates: notificationTitle, notificationBody with ${dest_ip}
}

// golang syntax, else match netfilter json
type ConditionEntry struct {
	Prefix string 	`json:"Prefix"`
	DestIp string 	`json:"DestIp"`
	DestPort int	`json:"DestPort"`
	SrcIp string 	`json:"SrcIp"`
	SrcPort int	`json:"SrcPort"`
}
/* example:
[
	{
		Conditions: { "Prefix": "nft:wan:out", "SrcIp": "192.168.2.18", "DestIp": "8.8.8.8" },
		Notification: true
	}
]
*/

var NotificationSettings = []SettingEntry{}

// return true if we should send a notification
func checkNotificationTraffic(logEntry netfilterEntry) bool {
	if logEntry.SrcPort == nil || logEntry.DestPort == nil {
		return false
	}

	// add nft prefix + remove extra whitespace from logs
	prefix := strings.TrimSpace(fmt.Sprintf("nft:%v", *logEntry.OobPrefix))

	//fmt.Printf("%%%% prefix=%v\n", prefix)

	for _, setting := range NotificationSettings {
		/*if setting.SendNotification != true {
			continue
		}*/

		shouldNotify := true

		cond := setting.Conditions

		if cond.Prefix != "" && cond.Prefix != prefix {
			shouldNotify = false
		}

		if cond.SrcIp != "" && cond.SrcIp != *logEntry.SrcIp {
			shouldNotify = false
		}

		if cond.DestIp != "" && cond.DestIp != *logEntry.DestIp {
			shouldNotify = false
		}

		if cond.SrcPort != 0 && cond.SrcPort != *logEntry.SrcPort {
			shouldNotify = false
		}

		if cond.DestPort != 0 && cond.DestPort != *logEntry.DestPort {
			shouldNotify = false
		}

		if shouldNotify {
			return true
		}
	}

	return false
}

func logTraffic(data string) {
	// use json layout for matching
	// TODO netfilterEntry and use same for Condition key
	//var logEntry map[string]interface{}
	var logEntry netfilterEntry
	if err := json.Unmarshal([]byte(data), &logEntry); err != nil {
		  log.Fatal(err)
	}

	fmt.Printf("## %v\n", *logEntry.Timestamp)

	shouldNotify := checkNotificationTraffic(logEntry)
	if shouldNotify {
		fmt.Printf("!! Send Notification\n")
		// send notification
	}

	/*if *logEntry.OobPrefix == "drop:input " {
		fmt.Printf("[LOG=%v] %v\n", shouldNotify, data)
	}*/
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
	loadNotificationConfig()

	log.Printf("notification settings: %v conditions loaded\n", len(NotificationSettings))

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
	client.Subscribe("nft:lan:in", logTraffic, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:lan:out", logTraffic, ServerEventSock, ServerEventPath)

	client.Subscribe("nft:drop:input", logTraffic, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:drop:forward", logTraffic, ServerEventSock, ServerEventPath)

	client.Subscribe("nft:wan:in", logTraffic, ServerEventSock, ServerEventPath)
	client.Subscribe("nft:wan:out", logTraffic, ServerEventSock, ServerEventPath)

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
