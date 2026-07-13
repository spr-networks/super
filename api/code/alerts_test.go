package main

import (
	"encoding/json"
	"sync"
	"testing"
	"time"
)

func mockAlertSettings() []AlertSetting {

	paths := []string{"{#1: $..[?@.fieldA > 0].value}",
		"$[?(@.fieldA > 1)].value",
		"$[?(@.fieldA > 2)].value",
		"$[?(@.value == \"testValue\")].value",
		"$[?(@.value =~ \"test*\")].value",
		"$[?(@.value =~ \"zest*\")].value"}

	alertSettings := []AlertSetting{}

	for _, path := range paths {
		copy := AlertSetting{
			TopicPrefix: "test:",
			MatchAnyOne: false,
			Conditions: []ConditionEntry{
				{JPath: path},
			},
			Actions: []ActionConfig{
				{SendNotification: true, StoreAlert: true, GrabEvent: true},
			}}
		alertSettings = append(alertSettings, copy)
	}

	return alertSettings
}

func TestAnyAlertRuleMatches(t *testing.T) {
	AlertSettingsmtx.Lock()
	saved := gAlertsConfig
	gAlertsConfig = []AlertSetting{
		{TopicPrefix: "wifi:auth:", Name: "a"},
		{TopicPrefix: "nft:drop:", Name: "b", Disabled: true},
	}
	AlertSettingsmtx.Unlock()
	defer func() {
		AlertSettingsmtx.Lock()
		gAlertsConfig = saved
		AlertSettingsmtx.Unlock()
	}()

	if !anyAlertRuleMatches("wifi:auth:success") {
		t.Error("enabled rule prefix should match")
	}
	if anyAlertRuleMatches("nft:drop:lan") {
		t.Error("disabled rule must not match")
	}
	if anyAlertRuleMatches("dns:serve:wan") {
		t.Error("no rule should match")
	}
}

func TestDispatchEventAlertsDoesNotBlockOnAlertChannels(t *testing.T) {
	AlertSettingsmtx.Lock()
	saved := gAlertsConfig
	gAlertsConfig = []AlertSetting{
		{
			TopicPrefix: "deadlock:",
			Actions: []ActionConfig{
				{SendNotification: true, StoreAlert: true},
			},
		},
	}
	AlertSettingsmtx.Unlock()
	defer func() {
		AlertSettingsmtx.Lock()
		gAlertsConfig = saved
		AlertSettingsmtx.Unlock()
	}()

	notifyChan := make(chan Alert)
	storeChan := make(chan Alert)
	done := make(chan struct{})
	go func() {
		dispatchEventAlerts(notifyChan, storeChan, "deadlock:topic", map[string]interface{}{"ok": true})
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("dispatchEventAlerts blocked on alert delivery")
	}

	select {
	case <-notifyChan:
	case <-time.After(time.Second):
		t.Fatal("processEventAlerts did not reach notification send")
	}

	select {
	case <-storeChan:
	case <-time.After(time.Second):
		t.Fatal("processEventAlerts did not reach store send")
	}
}

func TestProcessEventAlertsDoesNotHoldSettingsLockWhileSending(t *testing.T) {
	AlertSettingsmtx.Lock()
	saved := gAlertsConfig
	gAlertsConfig = []AlertSetting{
		{
			TopicPrefix: "deadlock:",
			Actions: []ActionConfig{
				{SendNotification: true, StoreAlert: true},
			},
		},
	}
	AlertSettingsmtx.Unlock()
	defer func() {
		AlertSettingsmtx.Lock()
		gAlertsConfig = saved
		AlertSettingsmtx.Unlock()
	}()

	notifyChan := make(chan Alert)
	storeChan := make(chan Alert)
	done := make(chan struct{})
	go func() {
		processEventAlerts(notifyChan, storeChan, "deadlock:topic", map[string]interface{}{"ok": true})
		close(done)
	}()

	select {
	case <-notifyChan:
	case <-time.After(time.Second):
		t.Fatal("processEventAlerts did not reach notification send")
	}

	locked := make(chan struct{})
	go func() {
		AlertSettingsmtx.Lock()
		AlertSettingsmtx.Unlock()
		close(locked)
	}()

	select {
	case <-locked:
	case <-time.After(200 * time.Millisecond):
		select {
		case <-storeChan:
		case <-time.After(time.Second):
		}
		t.Fatal("AlertSettingsmtx was held while processEventAlerts blocked on storeChan")
	}

	select {
	case <-storeChan:
	case <-time.After(time.Second):
		t.Fatal("processEventAlerts did not reach store send")
	}

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("processEventAlerts did not return after channels drained")
	}
}

func TestProcessEventAlerts(t *testing.T) {
	var wg sync.WaitGroup
	gAlertsConfig = mockAlertSettings()

	notifyChan := make(chan Alert)
	storeChan := make(chan Alert)

	notifications := []Alert{}
	stores := []Alert{}

	getNotify := func(ch <-chan Alert) {
		defer wg.Done()
		for message := range ch {
			notifications = append(notifications, message)
		}
	}

	getStore := func(ch <-chan Alert) {
		defer wg.Done()
		for message := range ch {
			stores = append(stores, message)
		}
	}

	wg.Add(1)
	go getNotify(notifyChan)
	wg.Add(1)
	go getStore(storeChan)

	testEventJSON := `{"fieldA":2,"value":"testValue"}`
	no_matches := `{"fieldX":2,"value":"nope"}`

	event := interface{}(nil)
	err := json.Unmarshal([]byte(testEventJSON), &event)
	if err != nil {
		log.Println("invalid json for event", err)
		return
	}

	processEventAlerts(notifyChan, storeChan, "test:topic", event)

	err = json.Unmarshal([]byte(no_matches), &event)
	if err != nil {
		log.Println("invalid json for event", err)
		return
	}

	processEventAlerts(notifyChan, storeChan, "test:topic", event)

	close(notifyChan)
	close(storeChan)

	wg.Wait()

	if len(notifications) != 4 {
		t.Errorf("notification mismatch")
	}

	if len(stores) != 4 {
		t.Errorf("stores mismatch")

	}

	for _, alert := range notifications {
		if alert.Info["Event"] != testEventJSON {
			z := alert.Info["Event"]
			a, _ := json.Marshal(z)
			if string(a) != testEventJSON {
				t.Errorf("wrong event")
			}
		}
	}
}

var testEventJSON2 = `{"stringA":"abc","stringB":"xyz","stringC":"123"}`

func mockAlertSettings2() []AlertSetting {

	paths := []string{"{#1: $..[?@.fieldA > 0].value}",
		"$[?(@.fieldA > 1)].value",
		"$[?(@.fieldA > 2)].value",
		"$[?(@.value == \"testValue\")].value",
		"$[?(@.value =~ \"test*\")].value",
		"$[?(@.value =~ \"zest*\")].value"}

	alertSettings := []AlertSetting{}

	//this will match with only one
	alertSettings = append(alertSettings, AlertSetting{
		TopicPrefix: "test:topic",
		MatchAnyOne: true,
		Conditions: []ConditionEntry{
			{JPath: "$[?(@.missingField == \"boo\")]"},
			{JPath: "$[?(@.stringB == \"xyz\")]"},
			{JPath: "$[?(@.stringC == \"xyz\")]"},
		},
		Actions: []ActionConfig{
			{SendNotification: true, StoreAlert: true, GrabEvent: true},
		},
	})

	//this will fail to match
	alertSettings = append(alertSettings, AlertSetting{
		TopicPrefix: "test:topic",
		MatchAnyOne: false,
		Conditions: []ConditionEntry{
			{JPath: "$[?(@.missingField == \"boo\")]"},
			{JPath: "$[?(@.stringB == \"xyz\")]"},
			{JPath: "$[?(@.stringC == \"xyz\")]"},
		},
		Actions: []ActionConfig{
			{SendNotification: true, StoreAlert: true, GrabEvent: true},
		},
	})

	//this will match all fields
	alertSettings = append(alertSettings, AlertSetting{
		TopicPrefix: "test:topic",
		MatchAnyOne: false,
		Conditions: []ConditionEntry{
			{JPath: "$[?(@.stringA == \"abc\")]"},
			{JPath: "$[?(@.stringB == \"xyz\")]"},
			{JPath: "$[?(@.stringC == \"123\")]"},
		},
		Actions: []ActionConfig{
			{SendNotification: true, StoreAlert: true, GrabEvent: true},
		},
	})

	//test an expression, this will match
	alertSettings = append(alertSettings, AlertSetting{
		TopicPrefix: "test:topic",
		MatchAnyOne: false,
		Conditions: []ConditionEntry{
			{JPath: "$[?(@.stringA == \"abc\" && @.stringB == \"xyz\")]"},
		},
		Actions: []ActionConfig{
			{SendNotification: true, StoreAlert: true, GrabEvent: true},
		},
	})

	//no match due to inversion
	alertSettings = append(alertSettings, AlertSetting{
		TopicPrefix: "test:topic",
		MatchAnyOne: false,
		InvertRule:  true,
		Conditions: []ConditionEntry{
			{JPath: "$[?(@.stringA == \"abc\" && @.stringB == \"xyz\")]"},
		},
		Actions: []ActionConfig{
			{SendNotification: true, StoreAlert: true, GrabEvent: true},
		},
	})

	//yes match due to inversion
	alertSettings = append(alertSettings, AlertSetting{
		TopicPrefix: "test:topic",
		MatchAnyOne: false,
		InvertRule:  true,
		Conditions: []ConditionEntry{
			{JPath: "$[?(@.missingField == \"boo\")]"},
			{JPath: "$[?(@.stringB == \"xyz\")]"},
			{JPath: "$[?(@.stringC == \"xyz\")]"},
		},
		Actions: []ActionConfig{
			{SendNotification: true, StoreAlert: true, GrabEvent: true},
		},
	})

	for _, path := range paths {
		copy := AlertSetting{
			TopicPrefix: "test:",
			MatchAnyOne: false,
			Conditions: []ConditionEntry{
				{JPath: path},
			},
			Actions: []ActionConfig{
				{SendNotification: true, StoreAlert: true, GrabEvent: true},
			}}
		alertSettings = append(alertSettings, copy)
	}

	return alertSettings
}

func TestProcessEventAlerts2(t *testing.T) {
	var wg sync.WaitGroup
	gAlertsConfig = mockAlertSettings2()

	storeChan := make(chan Alert)
	notifyChan := make(chan Alert)

	notifications := []Alert{}
	stores := []Alert{}

	getNotify := func(ch <-chan Alert) {
		defer wg.Done()
		for message := range ch {
			notifications = append(notifications, message)
		}
	}

	getStore := func(ch <-chan Alert) {
		defer wg.Done()
		for message := range ch {
			stores = append(stores, message)
		}
	}

	wg.Add(1)
	go getNotify(notifyChan)
	wg.Add(1)
	go getStore(storeChan)

	event := interface{}(nil)
	err := json.Unmarshal([]byte(testEventJSON2), &event)
	if err != nil {
		log.Println("invalid json for event", err)
		return
	}

	processEventAlerts(notifyChan, storeChan, "test:topic", event)
	close(notifyChan)
	close(storeChan)

	wg.Wait()

	if len(notifications) != 4 {
		t.Errorf("notification count mismatch")
	}

	if len(stores) != 4 {
		t.Errorf("stores count mismatch")

	}

	for _, alert := range notifications {
		if alert.Info["Event"] != testEventJSON2 {
			z := alert.Info["Event"]
			a, _ := json.Marshal(z)
			if string(a) != testEventJSON2 {
				t.Errorf("wrong event")
			}
		}
	}
}

func TestProcessBugAlerts(t *testing.T) {
	var wg sync.WaitGroup
	gAlertsConfig = []AlertSetting{}

	//had a crash when GrabValues was false and GrabFields had elements
	//and another crash when GrabValues and GrabEvent were true
	crashAlertSetting := AlertSetting{
		TopicPrefix: "auth:failure",
		MatchAnyOne: false,
		InvertRule:  false,
		Conditions: []ConditionEntry{
			{JPath: "$[?(@.type==\"user\")]"},
		},
		Actions: []ActionConfig{
			{SendNotification: true, StoreAlert: true, GrabEvent: true, GrabValues: false, GrabFields: []string{"name", "reason", "type"}},
			{SendNotification: true, StoreAlert: true, GrabEvent: true, GrabValues: true, GrabFields: []string{"name", "reason", "type"}},
			{SendNotification: true, StoreAlert: true, GrabEvent: false, GrabValues: true, GrabFields: []string{"name", "reason", "type"}},
			{SendNotification: true, StoreAlert: true, GrabEvent: false, GrabValues: false, GrabFields: []string{"name", "reason", "type"}},
		}}
	gAlertsConfig = append(gAlertsConfig, crashAlertSetting)

	notifyChan := make(chan Alert)
	storeChan := make(chan Alert)

	notifications := []Alert{}
	stores := []Alert{}

	getNotify := func(ch <-chan Alert) {
		defer wg.Done()
		for message := range ch {
			notifications = append(notifications, message)
		}
	}

	getStore := func(ch <-chan Alert) {
		defer wg.Done()
		for message := range ch {
			stores = append(stores, message)
		}
	}

	wg.Add(1)
	go getNotify(notifyChan)
	wg.Add(1)
	go getStore(storeChan)

	auth_event := `{"name":"admin","reason":"bad password","type":"user"}`
	//crash test cases

	event := interface{}(nil)
	err := json.Unmarshal([]byte(auth_event), &event)
	if err != nil {
		log.Println("invalid json for event", err)
		return
	}

	processEventAlerts(notifyChan, storeChan, "auth:failure", event)

	close(notifyChan)
	close(storeChan)

	wg.Wait()

	if len(notifications) != 4 {
		t.Errorf("notification count mismatch")
	}

	if len(stores) != 4 {
		t.Errorf("stores count mismatch")
	}

	//last event has grab values/evnets as 0 and so is null
	for idx, alert := range notifications {
		if idx < 2 {
			z := alert.Info["Event"]
			a, _ := json.Marshal(z)
			if string(a) != auth_event {
				t.Errorf("wrong event")
			}
		} else if idx == 2 {
			a, _ := json.Marshal(alert.Info["Values"])
			if string(a) != `[[{"name":"admin","reason":"bad password","type":"user"}]]` {
				t.Errorf("wrong values")
			}
		} else if idx == 3 {
			if alert.Info["Values"] != nil {
				t.Errorf("Grab Values and Grab Events was false, no values expected")
			}
		}
	}
}

func TestAlertIgnoreExceptionCondition(t *testing.T) {
	event := map[string]interface{}{
		"Ethernet": map[string]interface{}{"SrcMAC": "aa:bb:cc:dd:ee:ff"},
		"IP":       map[string]interface{}{"DstIP": "10.0.0.8"},
	}
	condition := ConditionEntry{
		JPath: `$[?(@.Ethernet.SrcMAC!="aa:bb:cc:dd:ee:ff" || @.IP.DstIP!="10.0.0.8")]`,
	}

	err, matched, _ := matchEventCondition([]interface{}{event}, condition)
	if err != nil {
		t.Fatalf("ignore condition failed to evaluate: %v", err)
	}
	if matched {
		t.Fatal("exact ignored signature should not satisfy the alert condition")
	}

	event["IP"].(map[string]interface{})["DstIP"] = "10.0.0.9"
	err, matched, _ = matchEventCondition([]interface{}{event}, condition)
	if err != nil {
		t.Fatalf("ignore condition failed to evaluate: %v", err)
	}
	if !matched {
		t.Fatal("a different signature should continue to satisfy the alert condition")
	}
}
