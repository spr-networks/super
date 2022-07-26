package main
/*
this is a test client that subscribe to events from ulogd
and prints out log message depending on log prefix from netfilter

code will be moved to api / websocket for sending out notifications
depending on settings
*/

import (
	"fmt"
	"log"
	"time"
	"net/rpc"

	"github.com/asaskevich/EventBus"
)

func ipIn(json string) {
	fmt.Printf("[<<] %v", json)
}

func ipOut(json string) {
	fmt.Printf("[>>] %v", json)
}

func ipConnect(json string) {
	fmt.Printf("[ip] %v", json)
}

func ipDrop(json string) {
	fmt.Printf("[drop] %v\n", json)
}

func lanIn(json string) {
	fmt.Printf("[lan] %v\n", json)
}

func main() {
	log.Println("server")

	//server := EventBus.NewServer(":2022", "/_server_bus_", EventBus.New())
	//server.Start()

	rpcClient, err := rpc.DialHTTPPath("tcp", ":2020", "/_server_bus_")
	if (rpcClient == nil) {
		log.Fatal(err)
		return
	}


	log.Println("client")

	client := EventBus.NewClient(":2025", "/_client_bus_", EventBus.New())
	client.Start()

	log.Println("subscribe")
	client.Subscribe("nft:ip", ipConnect, ":2020", "/_server_bus_")
	client.Subscribe("nft:ip:in", ipIn, ":2020", "/_server_bus_")
	client.Subscribe("nft:ip:out", ipOut, ":2020", "/_server_bus_")
	client.Subscribe("nft:drp:inp", ipDrop, ":2020", "/_server_bus_")
	client.Subscribe("nft:lan:in", lanIn, ":2020", "/_server_bus_")

	for {
		//fmt.Println("sleeping...")
		time.Sleep(10 * time.Second)
	}


	//defer networkBus.Stop()
	defer client.Stop()
}
