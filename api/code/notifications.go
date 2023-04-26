package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	logStd "log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/google/gopacket/layers"
	"github.com/gorilla/mux"
	"github.com/spr-networks/sprbus"
)

var NotificationSettingsFile = "/configs/base/notifications.json"

// notifications.json is array of this:
type NotificationSetting struct {
	//Conditions map[string]interface{}	`json:"Conditions"`
	Conditions       ConditionEntry `json:"Conditions"`
	SendNotification bool           `json:"Notification"`
	// could have templates: notificationTitle, notificationBody with ${dest_ip}
}

type ConditionEntry struct {
	Prefix   string `json:"Prefix"`
	Protocol string `json:"Protocol"`
	DstIP    string `json:"DstIP"`
	DstPort  int    `json:"DstPort"`
	SrcIP    string `json:"SrcIP"`
	SrcPort  int    `json:"SrcPort"`
	InDev    string `json:"InDev"`
	OutDev   string `json:"OutDev"`
}

// new format for notifications
type PacketInfo struct {
	//Ethernet  *PacketEthernet `json:"Ethernet,omitempty"`
	TCP       *layers.TCP    `json:"TCP,omitempty"`
	UDP       *layers.UDP    `json:"UDP,omitempty"`
	IP        *layers.IPv4   `json:"IP,omitempty"`
	DNS       *layers.DNS    `json:"DNS,omitempty"`
	DHCP      *layers.DHCPv4 `json:"DHCP,omitempty"`
	Prefix    string         `json:"Prefix"`
	Action    string         `json:"Action"`
	Timestamp time.Time      `json:"Timestamp"`
	InDev     string         `json:"InDev"`
	OutDev    string         `json:"OutDev"`
}

/* example:
[
	{
		Conditions: { "Prefix": "nft:wan:out", "SrcIP": "192.168.2.18", "DstIP": "8.8.8.8" },
		Notification: true
	}
]
*/

var gNotificationConfig = []NotificationSetting{}

// NOTE reload on update
func loadNotificationConfig() {
	data, err := ioutil.ReadFile(NotificationSettingsFile)
	if err != nil {
		fmt.Println(err)
	} else {
		err = json.Unmarshal(data, &gNotificationConfig)
		if err != nil {
			fmt.Println(err)
		}
	}
}

func saveNotificationConfig() {
	file, _ := json.MarshalIndent(gNotificationConfig, "", " ")
	err := ioutil.WriteFile(NotificationSettingsFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func getNotificationSettings(w http.ResponseWriter, r *http.Request) {
	loadNotificationConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gNotificationConfig)
}

func modifyNotificationSettings(w http.ResponseWriter, r *http.Request) {
	loadNotificationConfig()

	//Nmtx.Lock()
	//defer Nmtx.Unlock()

	vars := mux.Vars(r)
	indexStr, index_ok := vars["index"]
	index := 0

	if index_ok {
		val, err := strconv.Atoi(indexStr)
		if err != nil {
			http.Error(w, "invalid index", 400)
			return
		}

		index = val
		if index < 0 || index >= len(gNotificationConfig) {
			http.Error(w, "invalid index", 400)
			return
		}
	}

	setting := NotificationSetting{}
	if r.Method == http.MethodPut {
		err := json.NewDecoder(r.Body).Decode(&setting)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		// validate
	}

	// delete, update, append
	if r.Method == http.MethodDelete {
		gNotificationConfig = append(gNotificationConfig[:index], gNotificationConfig[index+1:]...)
	} else if index_ok {
		gNotificationConfig[index] = setting
	} else {
		gNotificationConfig = append(gNotificationConfig, setting)
	}

	saveNotificationConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gNotificationConfig)
}

// return true if we should send a notification
func checkNotificationTraffic(logEntry PacketInfo) bool {
	if logEntry.Prefix == "" {
		return false
	}

	// add nft prefix + remove extra whitespace from logs
	prefix := strings.TrimSpace(fmt.Sprintf("nft:%v", logEntry.Prefix))

	for _, setting := range gNotificationConfig {
		if setting.SendNotification != true {
			continue
		}

		shouldNotify := true

		cond := setting.Conditions

		if cond.Prefix != "" && cond.Prefix != prefix {
			shouldNotify = false
		}

		if cond.InDev != "" && cond.InDev != logEntry.InDev {
			shouldNotify = false
		}

		if cond.OutDev != "" && cond.OutDev != logEntry.OutDev {
			shouldNotify = false
		}

		if cond.Protocol == "tcp" && logEntry.TCP == nil {
			shouldNotify = false
		}

		if cond.Protocol == "udp" && logEntry.UDP == nil {
			shouldNotify = false
		}

		if cond.SrcIP != "" && cond.SrcIP != fmt.Sprintf("%v", logEntry.IP.SrcIP) {
			shouldNotify = false
		}

		if cond.DstIP != "" && cond.DstIP != fmt.Sprintf("%v", logEntry.IP.DstIP) {
			shouldNotify = false
		}

		if cond.SrcPort != 0 {
			if cond.Protocol == "tcp" && logEntry.TCP == nil {
				shouldNotify = false
			} else if cond.Protocol == "tcp" && int(logEntry.TCP.SrcPort) != cond.SrcPort {
				shouldNotify = false
			}

			if cond.Protocol == "udp" && logEntry.UDP == nil {
				shouldNotify = false
			} else if cond.Protocol == "udp" && int(logEntry.UDP.SrcPort) != cond.SrcPort {
				shouldNotify = false
			}
		}

		if cond.DstPort != 0 {
			if cond.Protocol == "tcp" && logEntry.TCP == nil {
				shouldNotify = false
			} else if cond.Protocol == "tcp" && int(logEntry.TCP.DstPort) != cond.DstPort {
				shouldNotify = false
			}

			if cond.Protocol == "udp" && logEntry.UDP == nil {
				shouldNotify = false
			} else if cond.Protocol == "udp" && int(logEntry.UDP.DstPort) != cond.DstPort {
				shouldNotify = false
			}
		}

		if shouldNotify {
			return true
		}
	}

	return false
}

// the rest is eventbus -> ws forwarding
// this is run in a separate thread
func NotificationsRunEventListener() {
	loadNotificationConfig()

	log.Printf("notification settings: %v conditions loaded\n", len(gNotificationConfig))

	// wait for sprbus server to start
	for i := 0; i < 4; i++ {
		if _, err := os.Stat(ServerEventSock); err == nil {
			break
		}

		time.Sleep(time.Second / 4)
	}

	log.Println("registering handler for logging ...")

	notification := func(topic string, value string) {
		notifyAll := false
		for _, setting := range gNotificationConfig {
			// if theres a empty entry log all: {Notification: false} in json
			if setting.SendNotification == false && len(setting.Conditions.Prefix) == 0 {
				notifyAll = true
				break
			}
		}

		if strings.HasPrefix(topic, "nft") {
			var logEntry PacketInfo
			if err := json.Unmarshal([]byte(value), &logEntry); err != nil {
				logStd.Fatal(err)
			}

			shouldNotify := checkNotificationTraffic(logEntry)
			if shouldNotify || notifyAll {
                isNotification := shouldNotify
				WSNotifyMessage(topic, logEntry, isNotification)
			}
		} else if strings.HasPrefix(topic, "wifi:auth") {
			var data map[string]interface{}

			if err := json.Unmarshal([]byte(value), &data); err != nil {
				log.Println("failed to decode eventbus json:", err)
				return
			}

			WSNotifyValue(topic, data)
		} else if notifyAll {
			var data map[string]interface{}
			if err := json.Unmarshal([]byte(value), &data); err != nil {
				log.Println("failed to decode eventbus json:", err)
				return
			}

			// dont send as a notification - for sprbus view/ui
			WSNotifyMessage(topic, data, false)
		}
	}

	//retry 3 times to set this up
	for i := 3; i > 0; i-- {
		err := sprbus.HandleEvent("", notification)
		if err != nil {
			fmt.Println(err)
		}
		time.Sleep(1 * time.Second)
	}

	logStd.Println("sprbus client exit")
}
