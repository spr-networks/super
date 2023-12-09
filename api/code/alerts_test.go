package main

import (
	"fmt"
	"testing"
	"sync"
)

func mockAlertSettings() []AlertSetting {
	return []AlertSetting{
		/*        {
		          TopicPrefix: "test:",
		          MatchAnyOne: true,
		          Conditions: []ConditionEntry{
		              {JPath: "data.value"},
		          },
		          Actions: []ActionConfig{
		              {SendNotification: true},
		          },
		      },*/
		{
			TopicPrefix: "test:",
			MatchAnyOne: true,
			Conditions: []ConditionEntry{
				//                {JPath: "{#1: $..[?@.fieldA > 0].value}"},
				//                {JPath: "$[?(@.fieldA > 1)].value"},
				//                  {JPath: "$[?(@.fieldA > 2)].value"},
				//                  {JPath: "$[?(@.value == \"testValue\")].value"},
				{JPath: "$[?(@.value =~ \"test*\")].value"},
				//                    {JPath: "$[?(@.value =~ \"zest*\")].value"},
			},
			Actions: []ActionConfig{
				{SendNotification: true},
			},
		},
	}
}

var wg sync.WaitGroup

func TestProcessEventAlerts(t *testing.T) {
	gAlertsConfig = mockAlertSettings()

	notifyChan := make(chan Alert)
	storeChan := make(chan Alert)

	getNotify := func(ch <-chan Alert) {
		defer wg.Done()
		for message := range ch {
			fmt.Printf("Notify Received: %+v\n", message)
		}
	}

	getStore := func(ch <-chan Alert) {
		defer wg.Done()
		for message := range ch {
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
}
