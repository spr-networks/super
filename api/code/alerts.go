package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
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

	"github.com/google/uuid"

	"github.com/spr-networks/spr-apns-proxy"
)

//https://www.ietf.org/archive/id/draft-goessner-dispatch-jsonpath-00.html
//https://goessner.net/articles/JsonPath/

var AlertSettingsmtx sync.RWMutex

var AlertSettingsFile = "/configs/base/alerts.json"
var AlertDevicesFile = "/configs/base/alert_devices.json"
var MobileProxySettingsFile = "/configs/base/alert_proxy.json"
var gAlertTopicPrefix = "alerts:"
var gDebugPrintAlert = false

type Alert struct {
	Topic string
	Info  map[string]interface{}
}

type MobileAlertProxySettings struct {
	Disabled   bool
	APNSDomain string
}

type AlertSetting struct {
	TopicPrefix string
	MatchAnyOne bool //when true, only one condition has to match. when false, all have to match
	InvertRule  bool //when true, inverts the match conditions
	Conditions  []ConditionEntry
	Actions     []ActionConfig
	Name        string
	Disabled    bool
	RuleId      string
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
	NotificationType string `json:"NotificationType,omitempty"`
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

	//make sure it compiles
	builder := gval.Full(jsonpath.PlaceholderExtension())
	_, err := builder.NewEvaluable(entry.JPath)
	if err != nil {
		return err
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
		//copy over old rule id
		setting.RuleId = gAlertsConfig[index].RuleId
		gAlertsConfig[index] = setting
	} else {
		setting.RuleId = uuid.New().String()
		gAlertsConfig = append(gAlertsConfig, setting)
	}

	saveAlertsConfig()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gAlertsConfig)
}

// AlertDevices
type AlertDevice struct {
	DeviceId    string
	DeviceToken string
	PublicKey   string
	LastActive  time.Time
}

func (a *AlertDevice) Validate() error {
	// iOS: "FCDBD8EF-62FC-4ECB-B2F5-92C9E79AC7F9"
	// Android: "dd96dec43fb81c97"
	validId := regexp.MustCompile(`^[0-9a-fA-F\-]{36}$`).MatchString
	if !validId(a.DeviceId) {
		return fmt.Errorf("Invalid DeviceId")
	}

	validToken := regexp.MustCompile(`^[0-9a-fA-F]{64}$`).MatchString
	if !validToken(a.DeviceToken) {
		return fmt.Errorf("Invalid DeviceToken")
	}

	//TODO
	if a.PublicKey == "" {
		return fmt.Errorf("Invalid PublicKey")
	}

	return nil
}

var AlertDevicesmtx sync.RWMutex
var gAlertDevices = []AlertDevice{}

func loadAlertDevices() {
	data, err := ioutil.ReadFile(AlertDevicesFile)
	if err != nil {
		log.Println(err)
	} else {
		err = json.Unmarshal(data, &gAlertDevices)
		if err != nil {
			log.Println(err)
		}
	}
}

func saveAlertDevices() {
	//assumes lock is held
	file, _ := json.MarshalIndent(gAlertDevices, "", " ")
	err := ioutil.WriteFile(AlertDevicesFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

func registerAlertDevice(w http.ResponseWriter, r *http.Request) {
	AlertDevicesmtx.Lock()
	defer AlertDevicesmtx.Unlock()

	loadAlertDevices()

	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(gAlertDevices)
		return
	}

	setting := AlertDevice{}
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

	index := -1
	for i, entry := range gAlertDevices {
		//TODO also have a id for the device here
		if entry.DeviceId == setting.DeviceId {
			index = i
			break
		}
	}

	if index == -1 && r.Method == http.MethodDelete {
		http.Error(w, "Invalid DeviceId", 400)
		return
	}

	setting.LastActive = time.Now()

	// delete, update, append
	if r.Method == http.MethodDelete {
		gAlertDevices = append(gAlertDevices[:index], gAlertDevices[index+1:]...)
	} else if index >= 0 {
		gAlertDevices[index] = setting
	} else {
		gAlertDevices = append(gAlertDevices, setting)
	}

	saveAlertDevices()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gAlertDevices)
}

// NOTE only for testing, can remove this later
func testSendAlertDevice(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Invalid method", 400)
		return
	}

	vars := mux.Vars(r)
	deviceToken, deviceToken_ok := vars["deviceToken"]

	if !deviceToken_ok {
		http.Error(w, "Invalid deviceToken", 400)
		return
	}

	alert := apnsproxy.APNSAlert{}
	err := json.NewDecoder(r.Body).Decode(&alert)

	if alert.Title == "" {
		http.Error(w, "Missing title", 400)
		return
	}

	if alert.Body == "" {
		http.Error(w, "Missing body", 400)
		return
	}

	err = sendDeviceAlertByToken(deviceToken, alert.Title, alert.Body)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	//TODO return ok

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(alert)
}

var gMobileAlertProxySettings = MobileAlertProxySettings{}

func loadMobileProxySettings() {
	//assumes lock is held
	data, err := ioutil.ReadFile(MobileProxySettingsFile)
	if err != nil {
		log.Println(err)
	} else {
		err = json.Unmarshal(data, &gMobileAlertProxySettings)
		if err != nil {
			log.Println(err)
		}
	}
}

func saveMobileProxySettings() {
	//assumes lock is held
	file, _ := json.MarshalIndent(gMobileAlertProxySettings, "", " ")
	err := ioutil.WriteFile(MobileProxySettingsFile, file, 0600)
	if err != nil {
		log.Fatal(err)
	}
}

var ProxySettingsmtx sync.RWMutex

func alertsMobileProxySettings(w http.ResponseWriter, r *http.Request) {
	ProxySettingsmtx.Lock()
	defer ProxySettingsmtx.Unlock()

	if r.Method == http.MethodGet {
		loadAlertsConfig()
	} else {
		setting := MobileAlertProxySettings{}
		err := json.NewDecoder(r.Body).Decode(&setting)
		if err != nil {
			gMobileAlertProxySettings = setting
			saveMobileProxySettings()
		} else {
			if err != nil {
				http.Error(w, err.Error(), 400)
				return
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(gMobileAlertProxySettings)
}

func APNSNotify(msg_type string, data interface{}) {

	bytes, err := json.Marshal(data)
	if err != nil {
		log.Println("invalid json for APNS event", err)
		return
	}

	AlertDevicesmtx.RLock()
	defer AlertDevicesmtx.RUnlock()
	ProxySettingsmtx.RLock()
	defer ProxySettingsmtx.RUnlock()

	for _, entry := range gAlertDevices {
		err = sendDeviceAlertLocked(entry, msg_type, string(bytes))
		if err != nil {
			log.Println("Failed to send event", err, "to", entry.DeviceId)
		}
	}
}

func sendDeviceAlertByToken(deviceToken string, title string, message string) error {
	/*
			   deviceToken is stored here:
			   /configs/base/alert_devices.json

			   fetch the .PublicKey for the device, set as .EncryptedData

		       the device will also have a .LastActive set, see struct
		       checks if device have logged in within 1 month
	*/
	AlertDevicesmtx.RLock()
	defer AlertDevicesmtx.RUnlock()

	ProxySettingsmtx.RLock()
	defer ProxySettingsmtx.RUnlock()

	if gMobileAlertProxySettings.Disabled {
		//disabled, do not send
		return nil
	}

	loadAlertDevices()

	device := AlertDevice{}
	for _, entry := range gAlertDevices {
		//TODO also have a id for the device here
		if entry.DeviceToken == deviceToken {
			return sendDeviceAlertLocked(device, title, message)
		}
	}

	return fmt.Errorf("could not find device " + deviceToken)
}

func sendDeviceAlertLocked(device AlertDevice, title string, message string) error {
	if gMobileAlertProxySettings.Disabled {
		//disabled, do not send
		return nil
	}

	//TODO read from settings, will change to https://notifications.supernetworks.org
	proxyUrl := "https://notifications.supernetworks.org"
	//grab APNSDomain when enabled
	if gMobileAlertProxySettings.APNSDomain != "" {
		proxyUrl = gMobileAlertProxySettings.APNSDomain
	}

	if device.DeviceId == "" {
		return fmt.Errorf("Invalid deviceToken")
	}

	var apns apnsproxy.APNS

	if device.LastActive.Before(time.Now().AddDate(0, -1, 0)) {
		//TODO cleanup
		fmt.Println("device expired:", device.DeviceId, "lastActive:", device.LastActive)
		return fmt.Errorf("Device has not been active, skipping")
	}

	if device.PublicKey == "" {
		apns = apnsproxy.APNS{
			Aps: apnsproxy.APNSAps{
				Category: "PLAIN", //used for testing
				Alert: &apnsproxy.APNSAlert{
					Title: title,
					Body:  message,
				},
			},
		}
	} else {
		//NOTE we encrypt the json data here to be able to set more stuff in the future
		alert := apnsproxy.APNSAlert{Title: title, Body: message}
		jsonValue, _ := json.Marshal(alert)

		pubPem, _ := pem.Decode([]byte(device.PublicKey))
		parsedKey, err := x509.ParsePKIXPublicKey(pubPem.Bytes)

		var pubKey *rsa.PublicKey
		pubKey, ok := parsedKey.(*rsa.PublicKey)
		if !ok {
			return fmt.Errorf("invalid pubkey for device")
		}

		dataRaw, err := rsa.EncryptPKCS1v15(rand.Reader, pubKey, []byte(jsonValue))
		if err != nil {
			return err
		}

		data := base64.StdEncoding.EncodeToString([]byte(dataRaw))

		apns = apnsproxy.APNS{
			EncryptedData: data,
		}
	}

	return apnsproxy.SendProxyNotification(proxyUrl, device.DeviceToken, apns)
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

func processAction(notifyChan chan<- Alert, storeChan chan<- Alert, event_topic string, event interface{}, action ActionConfig, values []interface{}, RuleId string) {
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
	Info["RuleId"] = RuleId

	if action.NotificationType != "" {
		Info["NotificationType"] = action.NotificationType
	}

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
					processAction(notifyChan, storeChan, topic, event, action, values, rule.RuleId)
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
