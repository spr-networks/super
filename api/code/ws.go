package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	wsAuthTimeout        = 10 * time.Second
	wsAuthMaxMessageSize = 8 * 1024
)

type WSClient struct {
	*websocket.Conn
	WildcardListener bool
}

var WSClients []*WSClient
var WSMtx sync.Mutex
var wsGeneration uint64
var wsPendingConnections = make(chan struct{}, 32)

var WSNotify = make(chan *WSMessage, 100)

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
		log.Printf("Failed to marshal data: %v", err)
		return
	}

	message := &WSMessage{msg_type, string(bytes), notification, wildcard}

	select {
	case WSNotify <- message:
	default:
		log.Printf("WSNotify channel full, dropping %s notification", msg_type)
	}

}

func WSNotifyValue(msg_type string, data interface{}) {
	WSNotifyMessage(msg_type, data, true, false)
}

func WSNotifyWildcardListeners(msg_type string, data interface{}) {
	//slow path we have a broadcast listener, otherwise just skip altogether
	WSMtx.Lock()
	has_wildcard := WSHasWildcardListenerUnlocked()
	WSMtx.Unlock()
	if has_wildcard {
		WSNotifyMessage(msg_type, data, false, true)
	}
}

func WSHasWildcardListener() bool {
	WSMtx.Lock()
	defer WSMtx.Unlock()
	return WSHasWildcardListenerUnlocked()
}

func WSHasWildcardListenerUnlocked() bool {
	//use a tmp array to keep track of active clients to keep
	for _, client := range WSClients {
		if client.WildcardListener {
			return true
		}
	}
	return false
}

func WSRemoveClients(remove map[*WSClient]bool) {
	WSMtx.Lock()
	defer WSMtx.Unlock()
	kept := WSClients[:0]
	for _, client := range WSClients {
		if !remove[client] {
			kept = append(kept, client)
		}
	}
	WSClients = kept
}

type apnsJob struct {
	msgType string
	data    string
}

var apnsQueue = make(chan apnsJob, 64)

func apnsWorker() {
	for j := range apnsQueue {
		APNSNotify(j.msgType, j.data)
	}
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
		clients := append([]*WSClient(nil), WSClients...)
		WSMtx.Unlock()

		failed := map[*WSClient]bool{}
		delivered := 0
		for _, client := range clients {
			if message.WildcardAll {
				//dont send wildcard messages to clients that are not listening to them.
				if !client.WildcardListener {
					continue
				}
			}

			_ = client.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := client.WriteMessage(websocket.TextMessage, bytes); err != nil {
				failed[client] = true
				_ = client.Close()
				continue
			}
			delivered++
		}
		if len(failed) > 0 {
			WSRemoveClients(failed)
		}

		//if no WS clients got data sent, then run APNS instead
		// if it was not a wildcardall message
		if delivered == 0 && !message.WildcardAll {
			select {
			case apnsQueue <- apnsJob{message.Type, message.Data}:
			default:
				log.Printf("APNS queue full, dropping %s notification", message.Type)
			}
		}

	}
}

func WSRunNotify() {
	go WSRunBroadcast()
	go apnsWorker()
}

func WSCloseAll() {
	WSMtx.Lock()
	clients := WSClients
	WSClients = nil
	wsGeneration++
	WSMtx.Unlock()
	for _, client := range clients {
		_ = client.Close()
	}
}

func authWebsocket(r *http.Request, c *websocket.Conn, OtpOff bool) bool {
	//wait for authentication information
	c.SetReadLimit(wsAuthMaxMessageSize)
	deadline := time.Now().Add(wsAuthTimeout)
	_ = c.SetReadDeadline(deadline)
	_ = c.SetWriteDeadline(deadline)
	mt, msg, err := c.ReadMessage()
	if err != nil {
		fmt.Println("Invalid auth packet")
		c.Close()
		return false
	}

	if mt != websocket.TextMessage {
		fmt.Println("Invalid auth message type")
		c.Close()
		return false
	}

	msgs := string(msg)
	if strings.Contains(msgs, ":") {
		rateKey := authRateKey("password", r)
		if authFailureRateLimited(rateKey) {
			_ = c.WriteMessage(websocket.TextMessage, []byte("Authentication failure"))
			_ = c.Close()
			return false
		}
		pieces := strings.SplitN(msgs, ":", 3)
		if len(pieces) > 1 && authenticateUser(pieces[0], pieces[1]) {
			if !OtpOff && shouldCheckOTPJWT(r, pieces[0]) {
				if len(pieces) != 3 || !validateJwt(pieces[0], pieces[2]) {
					//tell WS it a JWT was needed
					_ = c.WriteMessage(websocket.TextMessage, []byte("Invalid JWT OTP"))
					_ = c.Close()
					return false
				}
			}
			authFailureRateClear(rateKey)
			_ = c.SetWriteDeadline(time.Time{})
			_ = c.WriteMessage(websocket.TextMessage, []byte("success"))
			SprbusPublish("auth:success", map[string]string{"type": "user", "name": pieces[0], "reason": remoteIP(r) + ":" + "websocket", "ip": remoteIP(r)})
			return true
		} else {
			authPasswordFailureRateRecord(rateKey, pieces[0], pieces[1])
			SprbusPublish("auth:failure", map[string]string{"type": "user", "name": pieces[0], "reason": remoteIP(r) + ":" + "bad credentails on websocket", "ip": remoteIP(r)})
		}
	} else {
		token := msgs
		goodToken, tokenName, paths := authenticateToken(token)
		if goodToken {
			if len(paths) > 0 {
				//scoped tokens get rejected for WS
				SprbusPublish("auth:failure", map[string]string{"type": "token", "name": tokenName, "reason": remoteIP(r) + ":" + "unsupported scopes on websocket", "ip": remoteIP(r)})
			} else {
				_ = c.SetWriteDeadline(time.Time{})
				_ = c.WriteMessage(websocket.TextMessage, []byte("success"))
				SprbusPublish("auth:success", map[string]string{"type": "token", "name": tokenName, "reason": remoteIP(r) + ":" + "websocket", "ip": remoteIP(r)})
				return true
			}
		} else {
			SprbusPublish("auth:failure", map[string]string{"type": "token", "name": tokenName, "reason": remoteIP(r) + ":" + "unknown token", "ip": remoteIP(r)})
		}
	}
	_ = c.WriteMessage(websocket.TextMessage, []byte("Authentication failure"))
	_ = c.Close()
	return false
}

func handleWebsocket(w http.ResponseWriter, r *http.Request, wildcard bool) {
	select {
	case wsPendingConnections <- struct{}{}:
		defer func() { <-wsPendingConnections }()
	default:
		http.Error(w, "too many pending websocket connections", http.StatusTooManyRequests)
		return
	}

	var upgrader = websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		// nil CheckOrigin uses Gorilla's Origin host == request Host policy.
	}

	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	WSMtx.Lock()
	generation := wsGeneration
	WSMtx.Unlock()
	if authWebsocket(r, c, false) {
		WSMtx.Lock()
		if generation == wsGeneration {
			WSClients = append(WSClients, &WSClient{c, wildcard})
		} else {
			_ = c.Close()
		}
		WSMtx.Unlock()
	}
}

func webSocket(w http.ResponseWriter, r *http.Request) {
	handleWebsocket(w, r, false)
}

func webSocketWildcard(w http.ResponseWriter, r *http.Request) {
	handleWebsocket(w, r, true)
}
