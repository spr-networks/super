package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
)
import (
	"github.com/gorilla/websocket"
)

var WSClients []*websocket.Conn
var WSMtx sync.Mutex

var WSNotify = make(chan WSMessage)

type WSMessage struct {
	Type         string
	Data         string
	Notification bool
}

// if notification is set user will see a notification
// this is to separate so we can show sprbus messages in ui/cli
func WSNotifyMessage(msg_type string, data interface{}, notification bool) {
	bytes, err := json.Marshal(data)
	if err != nil {
		panic(err)
	}
	go func() {
		WSNotify <- WSMessage{msg_type, string(bytes), notification}
	}()
}

func WSNotifyValue(msg_type string, data interface{}) {
	WSNotifyMessage(msg_type, data, true)
}

func WSNotifyString(msg_type string, data string) {
	go func() {
		WSNotify <- WSMessage{msg_type, data, true}
	}()
}

func WSRunBroadcast() {
	//output a message from the WSNotify channel for each client
	for {
		message := <-WSNotify

		bytes, err := json.Marshal(message)
		if err != nil {
			panic(err)
		}

		WSMtx.Lock()
		//use a tmp array to keep track of active clients to keep
		tmp := WSClients[:0]
		for _, client := range WSClients {
			err := client.WriteMessage(websocket.TextMessage, bytes)
			if err == nil {
				//keep client around
				tmp = append(tmp, client)
			}
		}
		//swap tmp and WSClients
		WSClients = tmp
		WSMtx.Unlock()
	}
}

func WSRunNotify() {
	go WSRunBroadcast()
}

func (auth *authnconfig) webSocket(w http.ResponseWriter, r *http.Request) {

	var upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		//the API does not use cookie authentication -- this does not weaken security
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	//wait for authentication information
	mt, msg, err := c.ReadMessage()
	if err != nil {
		fmt.Println("Invalid auth packet")
		return
	}
	if mt != websocket.TextMessage {
		fmt.Println("Invalid auth message type")
		return
	}

	msgs := string(msg)
	if strings.Index(msgs, ":") != -1 {
		pieces := strings.SplitN(msgs, ":", 2)
		if auth.authenticateUser(pieces[0], pieces[1]) {
			c.WriteMessage(websocket.TextMessage, []byte("success"))
			WSMtx.Lock()
			WSClients = append(WSClients, c)
			WSMtx.Unlock()
			return
		}
	} else {
		token := msgs
		if auth.authenticateToken(token) {
			c.WriteMessage(websocket.TextMessage, []byte("success"))
			WSMtx.Lock()
			WSClients = append(WSClients, c)
			WSMtx.Unlock()
			return
		}
	}
	c.WriteMessage(websocket.TextMessage, []byte("Authentication failure"))
	c.Close()
	//WSClients = append(WSClients, c)
}
