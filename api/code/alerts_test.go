package main

import (
	"fmt"
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
			MatchAnyOne: true,
			Conditions: []ConditionEntry{
				{JPath: path},
			},
			Actions: []ActionConfig{
				{SendNotification: true},
			}}
		alertSettings = append(alertSettings, copy)
	}

	fmt.Println(alertSettings)
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
			fmt.Printf("Notify Received: %+v\n", message)
		}
	}

	getStore := func(ch <-chan Alert) {
		defer wg.Done()
		for message := range ch {
			stores = append(stores, message)
			fmt.Printf("Chan Received: %+v\n", message)
		}
	}

	wg.Add(1)
	go getNotify(notifyChan)
	wg.Add(1)
	go getStore(storeChan)

	testEventJSON2 := `{"data":{"fieldA": 2, "value": "testValue"}}`

	processEventAlerts(notifyChan, storeChan, "test:topic", testEventJSON2)
	close(notifyChan)
	close(storeChan)

	wg.Wait()

	fmt.Println(notifications)
	if len(notifications) != 1 {
		t.Errorf("notification mismatch")
	}
}
