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
	"regexp"
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
	Info  map[string]interface{}
}

type AlertSetting struct {
	TopicPrefix string
	MatchAnyOne bool //when true, only one condition has to match. when false, all have to match
	InvertRule  bool //when true, inverts the match conditions
	Conditions  []ConditionEntry
	Actions     []ActionConfig
	Name        string
	Disabled    bool
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
	GrabEvent        bool
	GrabValues       bool
	GrabFields       []string `json:"GrabFields,omitempty"`
}

func (a *AlertSetting) Validate() error {
	if a.TopicPrefix == "" {
		return fmt.Errorf("TopicPrefix cannot be empty")
	}

	for _, condition := range a.Conditions {
		if err := condition.Validate(); err != nil {
			return fmt.Errorf("Invalid condition: %v", err)
		}
	}

	if len(a.Actions) == 0 {
		return fmt.Errorf("At least one ActionConfig is required")
	}

	for _, action := range a.Actions {
		if err := action.Validate(); err != nil {
			return fmt.Errorf("Invalid action: %v", err)
		}
	}

	if a.Name == "" {
		return fmt.Errorf("Name cannot be empty")
	}

	return nil
}

func (entry *ConditionEntry) Validate() error {
	if len(entry.JPath) == 0 {
		return errors.New("JPath cannot be empty")
	}

	return nil
}

func (action *ActionConfig) Validate() error {
	// validate StoreTopicSuffix

	// ... (implement logic for validating StoreTopicSuffix)

	// validate ActionType

	// ... (implement logic for validating ActionType)

	// Attempt to compile regex patterns
	for _, field := range action.GrabFields {
		if isRegexp(field) {
			_, err := regexp.Compile(field)
			if err != nil {
				return err
			}
		}
	}

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

func grabReflectOld(fields []string, event interface{}) map[string]interface{} {
	newEvent := map[string]interface{}{}
	v := reflect.ValueOf(&event).Elem()
	for _, field := range fields {
		// Get the field by name
		fieldValue := v.FieldByName(field)
		// Check if the field exists
		if fieldValue.IsValid() {
			// Add the field to the newEvent map
			newEvent[field] = fieldValue.Interface()
		}
	}
	return newEvent
}

func isRegexp(field string) bool {
	return strings.HasPrefix(field, "/") && strings.HasSuffix(field, "/")
}

func grabReflect(fields []string, event interface{}) map[string]interface{} {
	newEvent := map[string]interface{}{}
	v := reflect.ValueOf(event)

	if v.Kind() == reflect.Ptr {
		v = v.Elem()
	}

	var patterns []*regexp.Regexp
	for _, field := range fields {
		if !isRegexp(field) {
			continue
		}
		pattern, err := regexp.Compile(field)
		if err != nil {
			continue
		}
		patterns = append(patterns, pattern)
	}

	for i := 0; i < v.NumField(); i++ {
		fieldValue := v.Field(i)
		fieldType := v.Type().Field(i)

		//check regex fields
		for _, pattern := range patterns {
			if pattern.MatchString(fieldType.Name) {
				newEvent[fieldType.Name] = fieldValue.Interface()
				continue
			}
		}

		//check the rest
		for _, field := range fields {
			if !isRegexp(field) && fieldType.Name == field {
				newEvent[fieldType.Name] = fieldValue.Interface()
			}
		}
	}

	return newEvent
}

func processAction(notifyChan chan<- Alert, storeChan chan<- Alert, event_topic string, event interface{}, action ActionConfig, values []interface{}) {
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

	Info["Topic"] = event_topic

	if action.MessageTitle != "" {
		Info["Title"] = action.MessageTitle
	}
	if action.MessageBody != "" {
		Info["Body"] = action.MessageBody
	}

	if action.GrabEvent {
		if len(action.GrabFields) != 0 {
			Info["Event"] = grabReflect(action.GrabFields, event)
		} else {
			Info["Event"] = event
		}
	}

	if action.GrabValues {
		Info["Values"] = values
	}

	Info["State"] = ""

	alert := Alert{Topic: topic, Info: Info}

	if action.SendNotification {
		notifyChan <- alert
	}

	if action.StoreAlert {
		storeChan <- alert
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

type Event struct {
	data interface{}
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
		if rule.Disabled {
			continue
		}
		if strings.HasPrefix(topic, rule.TopicPrefix) {
			values := []interface{}{}
			for _, condition := range rule.Conditions {
				err, matched, value := matchEventCondition([]interface{}{event}, condition)
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

			satisfied := (len(values) == len(rule.Conditions)) || (rule.MatchAnyOne && len(values) > 0)

			if rule.InvertRule {
				satisfied = !satisfied
			}

			//if there are no conditions, assume we match on the topic alone.
			if len(rule.Conditions) == 0 {
				satisfied = true
			}

			if satisfied {
				for _, action := range rule.Actions {
					processAction(notifyChan, storeChan, topic, event, action, values)
				}
			}
		}
	}
}

func AlertsRunEventListener() {
	var wg sync.WaitGroup
	AlertSettingsmtx.Lock()
	loadAlertsConfig()
	AlertSettingsmtx.Unlock()

	log.Printf("alert settings: %v alert rules loaded\n", len(gAlertsConfig))

	notifyChan := make(chan Alert)
	storeChan := make(chan Alert)

	doNotify := func(ch <-chan Alert) {
		defer wg.Done()
		for message := range ch {
			WSNotifyValue(message.Topic, message.Info)
		}
	}

	doStore := func(ch <-chan Alert) {
		defer wg.Done()
		for message := range ch {
			sprbus.Publish(message.Topic, message.Info)
		}
	}

	wg.Add(1)
	go doNotify(notifyChan)
	wg.Add(1)
	go doStore(storeChan)

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

	close(notifyChan)
	close(storeChan)

	wg.Wait()
	logStd.Println("sprbus client exit")
}
