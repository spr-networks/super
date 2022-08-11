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
	"io"
	"io/ioutil"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/spr-networks/sprbus"
)

var NotificationSettingsFile = "/configs/base/notifications.json"
var ServerEventSock = "/state/plugins/packet_logs/server.sock"
var wg sync.WaitGroup

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

func logTraffic(topic string, data string) {
	fmt.Printf("## topic: %v data: %v\n", topic, data)
	// use json layout for matching
	// TODO netfilterEntry and use same for Condition key
	//var logEntry map[string]interface{}
	var logEntry netfilterEntry
	if err := json.Unmarshal([]byte(data), &logEntry); err != nil {
		  log.Fatal(err)
	}

	fmt.Printf("## Notification: %v @ %v\n", topic, *logEntry.Timestamp)

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

	client, err := sprbus.NewClient(ServerEventSock)
	defer client.Close()

	if err != nil {
		log.Fatal("err", err)
	}

	fmt.Println("client connected:", client)

	stream, err := client.SubscribeTopic("nft:")
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

			topic = value[0:index-1]
			value = value[index:len(value)]

			logTraffic(topic, value)
		}
	}()

	time.Sleep(5*time.Second)
}
