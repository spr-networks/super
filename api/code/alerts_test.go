package main

import (
	"encoding/json"
	//"fmt"
	"sync"
	"testing"
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

	processEventAlerts(notifyChan, storeChan, "test:topic", testEventJSON)
	processEventAlerts(notifyChan, storeChan, "test:topic", no_matches)
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

	processEventAlerts(notifyChan, storeChan, "test:topic", testEventJSON2)
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
		if alert.Info["Event"] != testEventJSON2 {
			z := alert.Info["Event"]
			a, _ := json.Marshal(z)
			if string(a) != testEventJSON2 {
				t.Errorf("wrong event")
			}
		}
	}
}
