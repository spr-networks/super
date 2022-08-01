package main
/*
TODO move this to EventBus package since we've already modified things there

TODO NewClient + Subscribe so we can just import and use this as a package
*/

import (
	"fmt"
	"os"
	"net/rpc"

	"github.com/spr-networks/EventBus"
	//"main/EventBus"
)

var NotificationSettingsFile = "/configs/base/notifications.json"

var ServerEventSock = "/state/plugins/packet_logs/server.sock"
var ServerEventPath = "/_server_bus_"
//var ClientEventSock = "/state/plugins/packet_logs/client.sock"
//var ClientEventPath = "/_client_bus_"

type SprServer struct {
	server     *EventBus.Server
}

func SprBus() *SprServer {
	os.Remove(ServerEventSock)

	server := EventBus.NewServer(ServerEventSock, ServerEventPath, EventBus.New())
	server.Start()

	var sprServer = SprServer{server: server}

	return &sprServer
}

func (sprbus *SprServer) Stop() {
	sprbus.server.Stop()
}

func (sprbus *SprServer) Publish(topic string, message string) bool {
	// first check if any subscribers have dropped out
	subscribers := sprbus.server.Subscribers(topic)

	numClients := 0

	fmt.Println("## subs.", len(subscribers))

	// need this check to not crash if client is disconnected when we publish
	for _, sub := range subscribers {
		//fmt.Printf(">> sub #%d == %s %s\n", idx, sub.ClientAddr, sub.ClientPath)

		// remove subscribe if we cant connect to it
		rpcClient, err := rpc.DialHTTPPath("unix", sub.ClientAddr, sub.ClientPath)
		if err != nil {
			ret := sprbus.server.RemoveSubscriber(sub)
			fmt.Println("sub removed:", ret)

			//handler := server.rpcCallback
			//sprbus.server.EventBus().removeHandler(topic, idx)//server.EventBus().findHandlerIdx(_topic, handler))
		} else if rpcClient != nil {
			args := &EventBus.SubscribeArg{sub.ClientAddr, sub.ClientPath, EventBus.PublishService, EventBus.Subscribe, topic}
			hasClients := sprbus.server.HasClientSubscribed(args)
			if hasClients {
				numClients += 1
			}
		}
	}

	if numClients == 0 {
		//fmt.Println("%% no clients, continue")
		return true
	}

	sprbus.server.EventBus().Publish(topic, message)
	return false
}
