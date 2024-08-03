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
	"github.com/spr-networks/sprbus"
)

type WSClient struct {
	*websocket.Conn
	WildcardListener bool
}

var WSClients []*WSClient
var WSMtx sync.Mutex

var WSNotify = make(chan WSMessage, 100)

type WSMessage struct {
	Type         string
	Data         string
	Notification bool
	WildcardAll  bool
}

// if notification is set user will see a notification
// this is to separate so we can show sprbus messages in ui/cli
func WSNotifyMessage(msg_type string, data interface{}, notification bool, wildcard bool) {
	bytes, err := json.Marshal(data)
	if err != nil {
		panic(err)
	}
	go func() {
		WSNotify <- WSMessage{msg_type, string(bytes), notification, wildcard}
	}()
}

func WSNotifyValue(msg_type string, data interface{}) {
	WSNotifyMessage(msg_type, data, true, false)
}

func WSNotifyWildcardListeners(msg_type string, data interface{}) {
	WSNotifyMessage(msg_type, data, false, true)
}

func WSNotifyString(msg_type string, data string) {
	go func() {
		WSNotify <- WSMessage{msg_type, data, true, false}
	}()
}

func WSRunBroadcast() {
	//output a message from the WSNotify channel for each client
	for {
		message := <-WSNotify

		bytes, err := json.Marshal(message)
		if err != nil {
			log.Println("Failed to marshal", err)
			continue
		}

		WSMtx.Lock()
		//use a tmp array to keep track of active clients to keep
		tmp := WSClients[:0]
		for _, client := range WSClients {

			if message.WildcardAll {
				//dont send wildcard messages to clients that are not listening to them.
				if !client.WildcardListener {
					continue
				}
			}

			err := client.WriteMessage(websocket.TextMessage, bytes)
			if err == nil {
				//keep client around
				tmp = append(tmp, client)
			}
		}
		//swap tmp and WSClients
		WSClients = tmp
		clients_len := len(WSClients)
		WSMtx.Unlock()

		//if no WS clients got data sent, then run APNS instead
		// if it was not a wildcardall message
		if clients_len == 0  && !message.WildcardAll {
			APNSNotify(message.Type, message.Data)
		}

	}
}

func WSRunNotify() {
	go WSRunBroadcast()
}

func handleWebsocket(w http.ResponseWriter, r *http.Request, wildcard bool) {

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
		pieces := strings.SplitN(msgs, ":", 3)
		if len(pieces) > 1 && authenticateUser(pieces[0], pieces[1]) {
			if shouldCheckOTPJWT(r, pieces[0]) {
				if len(pieces) != 3 || !validateJwt(pieces[0], pieces[2]) {
					//tell WS it a JWT was needed
					c.WriteMessage(websocket.TextMessage, []byte("Invalid JWT OTP"))
					c.Close()
					return
				}
			}
			c.WriteMessage(websocket.TextMessage, []byte("success"))
			WSMtx.Lock()

			newClient := &WSClient{
				Conn:             c,
				WildcardListener: wildcard,
			}

			WSClients = append(WSClients, newClient)
			WSMtx.Unlock()
			sprbus.Publish("auth:success", map[string]string{"type": "user", "name": pieces[0], "reason": "websocket"})
			return
		} else {
			sprbus.Publish("auth:failure", map[string]string{"type": "user", "name": pieces[0], "reason": "bad credentails on websocket"})
		}
	} else {
		token := msgs
		goodToken, tokenName, paths := authenticateToken(token)
		if goodToken {
			if len(paths) > 0 {
				//scoped tokens get rejected for WS
				sprbus.Publish("auth:failure", map[string]string{"type": "token", "name": tokenName, "reason": "unsupported scopes on websocket"})
			} else {
				c.WriteMessage(websocket.TextMessage, []byte("success"))
				WSMtx.Lock()
				newClient := &WSClient{
					Conn:             c,
					WildcardListener: wildcard,
				}
				WSClients = append(WSClients, newClient)
				WSMtx.Unlock()
				sprbus.Publish("auth:success", map[string]string{"type": "token", "name": tokenName, "reason": "websocket"})
			}
			return
		} else {
			sprbus.Publish("auth:failure", map[string]string{"type": "token", "name": tokenName, "reason": "unknown token"})
		}
	}
	c.WriteMessage(websocket.TextMessage, []byte("Authentication failure"))
	c.Close()
}

func webSocket(w http.ResponseWriter, r *http.Request) {
	handleWebsocket(w, r, false)
}

func webSocketWildcard(w http.ResponseWriter, r *http.Request) {
	handleWebsocket(w, r, true)
}
