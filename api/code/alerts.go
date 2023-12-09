package main

import (
	"encoding/json"
	"errors"
	"io/ioutil"
	logStd "log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	//	"github.com/google/gopacket/layers"
	"github.com/gorilla/mux"
	"github.com/spr-networks/sprbus"
	"github.com/tidwall/gjson"
)

var AlertSettingsmtx sync.Mutex

var AlertSettingsFile = "/configs/base/alerts.json"
var gAlertTopicPrefix = "alerts:"

type AlertSetting struct {
	TopicPrefix string
	MatchAnyOne bool //when true, only one condition has to match. when false, all have to match
	InvertAlert bool //when true, inverts the match conditions
	Conditions  []ConditionEntry
	Actions     []ActionConfig
	Name        string

	Validate func() error
}

const (
	MString   = 0
	MRegexp   = 1
	MMinInt   = 2
	MMaxInt   = 3
	MMinFloat = 4
	MMaxFloat = 5
	MNil      = 6
)

// conditions can stack onto the same event,
type ConditionEntry struct {
	JPath     string //json path to event (gjson)
	MatchType int    // type of match

	MatchString   string  `json:"MatchString,omitempty"`
	MatchRegexp   string  `json:"MatchRegexp,omitempty"`
	MatchMinInt   int64   `json:"MatchMinInt,omitempty"`
	MatchMaxInt   int64   `json:"MatchMaxInt,omitempty"`
	MatchMinFloat float64 `json:"MatchMinFloat,omitempty"`
	MatchMaxFloat float64 `json:"MatchMaxFloat,omitempty"`
}

// actions to take can stack
type ActionConfig struct {
	SendNotification bool   //alerts can send immediate notifications
	StoreAlert       bool   //alerts can also be stored without notifying
	StoreTopicSuffix string `json:"BucketSuffix,omitempty"`
	MessageTitle     string `json:"MessageTitle,omitempty"`
	MessageBody      string `json:"MessageBody,omitempty"`
	ActionType       string `json:"ActionType,omitempty"`
	//ActionSatisfied  bool //we can consider an action work queue later.
}

func validateConditionEntry(entry ConditionEntry) error {
	if len(entry.JPath) == 0 {
		return errors.New("JPath cannot be empty")
	}

	// validate MatchType

	// ... (implement logic for validating MatchType and related fields)

	return nil
}

func validateActionConfig(action ActionConfig) error {
	// validate StoreTopicSuffix

	// ... (implement logic for validating StoreTopicSuffix)

	// validate ActionType

	// ... (implement logic for validating ActionType)

	return nil
}

var gAlertsConfig = []AlertSetting{}

func loadAlertsConfig() {
	//assumes lock is held
	data, err := ioutil.ReadFile(AlertSettingsFile)
	if err != nil {
		log.Println(err)
	} else {
		err = json.Unmarshal(data, &gAlertsConfig)
		if err != nil {
			log.Println(err)
		}
	}
}

func saveAlertsConfig() {
	//assumes lock is held
	file, _ := json.MarshalIndent(gAlertsConfig, "", " ")
	err := ioutil.WriteFile(AlertSettingsFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func getAlertSettings(w http.ResponseWriter, r *http.Request) {
	AlertSettingsmtx.Lock()
	defer AlertSettingsmtx.Unlock()

	loadAlertsConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gAlertsConfig)
}

func modifyAlertSettings(w http.ResponseWriter, r *http.Request) {
	AlertSettingsmtx.Lock()
	defer AlertSettingsmtx.Unlock()

	loadAlertsConfig()

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
		if index < 0 || index >= len(gAlertsConfig) {
			http.Error(w, "invalid index", 400)
			return
		}
	}

	setting := AlertSetting{}
	if r.Method == http.MethodPut {
		err := json.NewDecoder(r.Body).Decode(&setting)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		// validate
		err = setting.Validate()
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
	}

	// delete, update, append
	if r.Method == http.MethodDelete {
		gAlertsConfig = append(gAlertsConfig[:index], gAlertsConfig[index+1:]...)
	} else if index_ok {
		gAlertsConfig[index] = setting
	} else {
		gAlertsConfig = append(gAlertsConfig, setting)
	}

	saveAlertsConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gAlertsConfig)
}

func processAction(event gjson.Result, action ActionConfig) {
	/*
		// actions to take can stack
		type ActionConfig struct {
			SendNotification bool   //alerts can send immediate notifications
			StoreAlert       bool   //alerts can also be stored without notifying
			StoreTopicSuffix string `json:"BucketSuffix,omitempty"`
			MessageTitle     string `json:"MessageTitle,omitempty"`
			MessageBody      string `json:"MessageBody,omitempty"`
			ActionType       string `json:"ActionType,omitempty"`
			//ActionSatisfied  bool //we can consider an action work queue later.
		}
	*/

	//			var data map[string]interface{}
	alert := []string{}

	if action.SendNotification {
		WSNotifyValue("alert:"+action.StoreTopicSuffix, alert)
	}

	if action.StoreAlert {
		//send the action to the DB Store
		//StoreAlertQueue <- alert
	}

}

func matchEventCondition(event gjson.Result, condition ConditionEntry) bool {
	/*
		type ConditionEntry struct {
			JPath     string //json path to event (gjson)
			MatchType int    // type of match

			MatchString   string  `json:"MatchString,omitempty"`
			MatchRegexp   string  `json:"MatchRegexp,omitempty"`
			MatchMinInt   int64   `json:"MatchMinInt,omitempty"`
			MatchMaxInt   int64   `json:"MatchMaxInt,omitempty"`
			MatchMinFloat float64 `json:"MatchMinFloat,omitempty"`
			MatchMaxFloat float64 `json:"MatchMaxFloat,omitempty"`
		}
	*/
	value := event.Get(gjson.Escape(condition.JPath))
	if value.Value() != nil {
		//do stuff based on MatchType
	} else if condition.MatchType == MNil {
		//wanted to match nil
		return true
	}

	return false
}

func processEventAlerts(topic string, value string) {
	//make sure event settings dont change out from under us
	AlertSettingsmtx.Lock()
	defer AlertSettingsmtx.Lock()

	//gjson.Escape
	event := gjson.Parse(value)
	for _, rule := range gAlertsConfig {
		if strings.HasPrefix(topic, rule.TopicPrefix) {
			matchCount := 0

			for _, condition := range rule.Conditions {
				if matchEventCondition(event, condition) {
					matchCount += 1
					if rule.MatchAnyOne {
						//dont need to match all, just one, abort
						break
					}
				}
			}

			matched := (matchCount == len(rule.Conditions)) || (rule.MatchAnyOne && matchCount > 0)
			if rule.InvertAlert {
				matched = !matched
			}

			if matched {
				for _, action := range rule.Actions {
					processAction(event, action)
				}
			}
		}
	}
}

func AlertsRunEventListener() {
	AlertSettingsmtx.Lock()
	loadAlertsConfig()
	AlertSettingsmtx.Unlock()

	log.Printf("alert settings: %v alert rules loaded\n", len(gAlertsConfig))

	busEvent := func(topic string, value string) {

		//wifi:auth events are special, we always send them up the websocket
		// for the UI to react to
		if strings.HasPrefix(topic, "wifi:auth") {
			var data map[string]interface{}

			if err := json.Unmarshal([]byte(value), &data); err != nil {
				log.Println("failed to decode eventbus json:", err)
				return
			}

			WSNotifyValue(topic, data)
		}

		processEventAlerts(topic, value)

	}

	// wait for sprbus server to start
	for i := 0; i < 4; i++ {
		if _, err := os.Stat(ServerEventSock); err == nil {
			break
		}

		time.Sleep(time.Second / 4)
	}

	//retry 3 times to set this up
	for i := 3; i > 0; i-- {
		err := sprbus.HandleEvent("", busEvent)
		if err != nil {
			log.Println(err)
		}
		time.Sleep(1 * time.Second)
	}

	logStd.Println("sprbus client exit")
}
