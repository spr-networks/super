package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	logStd "log"
	"net/http"
	"os"
	"reflect"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/spr-networks/sprbus"

	"github.com/PaesslerAG/gval"
	"github.com/PaesslerAG/jsonpath"
)

//https://www.ietf.org/archive/id/draft-goessner-dispatch-jsonpath-00.html
//https://goessner.net/articles/JsonPath/

var AlertSettingsmtx sync.Mutex

var AlertSettingsFile = "/configs/base/alerts.json"
var gAlertTopicPrefix = "alerts:"
var gDebugPrintAlert = false

type Alert struct {
	Topic string
	Info  interface{}
}

type AlertSetting struct {
	TopicPrefix string
	MatchAnyOne bool //when true, only one condition has to match. when false, all have to match
	InvertAlert bool //when true, inverts the match conditions
	Conditions  []ConditionEntry
	Actions     []ActionConfig
	Name        string

	Validate func() error
}

// conditions can stack onto the same event,
type ConditionEntry struct {
	JPath string //json path to event (gval+jsonpath)
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

func processAction(notifyChan chan<- Alert, storeChan chan<- Alert, event interface{}, action ActionConfig, values []interface{}) {
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
	if gDebugPrintAlert {
		fmt.Println("=== event ===")
		fmt.Printf("%+v\n", event)
		fmt.Println("=== action ===")
		fmt.Printf("%+v\n", action)
		fmt.Println("=== values ===")
		fmt.Printf("%+v\n", values)
		fmt.Println("--- --- ---")
	}

	topic := "alert:" + action.StoreTopicSuffix
	Info := map[string]interface{}{}

	if action.MessageTitle != "" {
		Info["Title"] = action.MessageTitle
	}
	if action.MessageBody != "" {
		Info["Body"] = action.MessageBody
	}
	Info["test"] = "test info"

	alert := Alert{Topic: topic, Info: Info}

	fmt.Println("beam out")
	fmt.Println(alert)
	//
	if action.SendNotification {
		notifyChan <- alert
		//		WSNotifyValue("alert:"+action.StoreTopicSuffix, alert)
	}

	if action.StoreAlert {
		storeChan <- alert
		//send the action to the DB Store
		//StoreAlertQueue <- alert
	}

}

func isEmpty(x interface{}) bool {
	if x == nil {
		return true
	}

	v := reflect.ValueOf(x)
	switch v.Kind() {
	case reflect.Slice, reflect.Array, reflect.Map:
		return v.Len() == 0
	case reflect.String:
		return v.Len() == 0
	default:
		// for other types, return false
		return false
	}
}

func matchEventCondition(event interface{}, condition ConditionEntry) (error, bool, interface{}) {
	builder := gval.Full(jsonpath.PlaceholderExtension())

	path, err := builder.NewEvaluable(condition.JPath)
	if err != nil {
		return err, false, nil
	}

	value, err := path(context.Background(), event)
	if err != nil {
		return err, false, nil
	}

	return nil, !isEmpty(value), value
}

func processEventAlerts(notifyChan chan<- Alert, storeChan chan<- Alert, topic string, value string) {
	//make sure event settings dont change out from under us

	AlertSettingsmtx.Lock()
	defer AlertSettingsmtx.Unlock()

	event := interface{}(nil)
	err := json.Unmarshal([]byte(value), &event)
	if err != nil {
		log.Println("invalid json for event", err)
		return
	}

	for _, rule := range gAlertsConfig {
		if strings.HasPrefix(topic, rule.TopicPrefix) {
			values := []interface{}{}
			for _, condition := range rule.Conditions {
				err, matched, value := matchEventCondition(event, condition)
				if err != nil {
					log.Println("failed to build match condition", err, condition)
					continue
				}

				if matched {
					values = append(values, value)
					if rule.MatchAnyOne {
						//dont need to match all, just one, abort
						break
					}
				}
			}

			satisfied := (len(values) == len(rule.Conditions)) || (rule.MatchAnyOne && len(values) > 1)
			if rule.InvertAlert {
				satisfied = !satisfied
			}

			if satisfied {
				for _, action := range rule.Actions {
					processAction(notifyChan, storeChan, event, action, values)
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

	notifyChan := make(chan Alert)
	storeChan := make(chan Alert)

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

		processEventAlerts(notifyChan, storeChan, topic, value)

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
