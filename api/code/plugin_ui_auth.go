package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
)

const (
	pluginUIAuthProtocolVersion = 1
	pluginUITokenPrefix         = "sprui1_"
	pluginUITokenTTL            = 10 * time.Minute
)

type pluginUISession struct {
	ID        string
	PluginURI string
	ExpiresAt time.Time
}

type pluginUISessionRequest struct {
	PluginURI       string `json:"pluginURI"`
	ProtocolVersion int    `json:"protocolVersion"`
	ReplaceSession  string `json:"replaceSessionId,omitempty"`
}

type pluginUISessionResponse struct {
	Token           string `json:"token"`
	SessionID       string `json:"sessionId"`
	PluginURI       string `json:"pluginURI"`
	ExpiresAt       int64  `json:"expiresAt"`
	ProtocolVersion int    `json:"protocolVersion"`
}

var pluginUISessions = struct {
	sync.Mutex
	byToken map[[sha256.Size]byte]pluginUISession
	byID    map[string][sha256.Size]byte
}{
	byToken: map[[sha256.Size]byte]pluginUISession{},
	byID:    map[string][sha256.Size]byte{},
}

func randomPluginUIValue(size int) (string, error) {
	value := make([]byte, size)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func pluginUISessionScope(uri string) []string {
	return []string{"/plugins/" + uri + ":rw"}
}

func isPluginUIToken(token string) bool {
	return strings.HasPrefix(token, pluginUITokenPrefix)
}

func cleanupPluginUISessionsLocked(now time.Time) {
	for hash, session := range pluginUISessions.byToken {
		if !session.ExpiresAt.After(now) {
			delete(pluginUISessions.byToken, hash)
			delete(pluginUISessions.byID, session.ID)
		}
	}
}

func lookupPluginUISession(token string) (pluginUISession, bool) {
	if !isPluginUIToken(token) {
		return pluginUISession{}, false
	}

	hash := sha256.Sum256([]byte(token))
	now := time.Now()
	pluginUISessions.Lock()
	defer pluginUISessions.Unlock()
	cleanupPluginUISessionsLocked(now)
	session, exists := pluginUISessions.byToken[hash]
	return session, exists && session.ExpiresAt.After(now)
}

func revokePluginUISession(id string) {
	pluginUISessions.Lock()
	defer pluginUISessions.Unlock()
	if hash, exists := pluginUISessions.byID[id]; exists {
		delete(pluginUISessions.byID, id)
		delete(pluginUISessions.byToken, hash)
	}
}

func pluginForSandboxedUI(uri string) (PluginConfig, bool) {
	Configmtx.Lock()
	defer Configmtx.Unlock()
	targetIndex := -1
	for index, plugin := range config.Plugins {
		if plugin.URI == uri && plugin.Enabled && plugin.HasUI && plugin.IsUISandboxed() {
			targetIndex = index
			break
		}
	}
	if targetIndex == -1 {
		return PluginConfig{}, false
	}

	for index, plugin := range config.Plugins {
		if index != targetIndex && plugin.Enabled && plugin.URI != "" && pluginURIsOverlap(uri, plugin.URI) {
			return PluginConfig{}, false
		}
	}

	return config.Plugins[targetIndex], true
}

func mintPluginUISession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")

	request := pluginUISessionRequest{}
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid plugin UI session request", http.StatusBadRequest)
		return
	}
	if request.ProtocolVersion != pluginUIAuthProtocolVersion {
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"error":                     "unsupported_protocol",
			"supportedProtocolVersions": []int{pluginUIAuthProtocolVersion},
		})
		return
	}
	if _, exists := pluginForSandboxedUI(request.PluginURI); !exists {
		http.Error(w, "Plugin does not have an enabled sandboxed UI", http.StatusForbidden)
		return
	}

	secret, err := randomPluginUIValue(32)
	if err != nil {
		http.Error(w, "Could not create plugin UI session", http.StatusInternalServerError)
		return
	}
	sessionID, err := randomPluginUIValue(18)
	if err != nil {
		http.Error(w, "Could not create plugin UI session", http.StatusInternalServerError)
		return
	}

	token := pluginUITokenPrefix + secret
	hash := sha256.Sum256([]byte(token))
	session := pluginUISession{
		ID:        sessionID,
		PluginURI: request.PluginURI,
		ExpiresAt: time.Now().Add(pluginUITokenTTL),
	}

	pluginUISessions.Lock()
	cleanupPluginUISessionsLocked(time.Now())
	if request.ReplaceSession != "" {
		if previousHash, exists := pluginUISessions.byID[request.ReplaceSession]; exists {
			previous := pluginUISessions.byToken[previousHash]
			if previous.PluginURI == request.PluginURI {
				delete(pluginUISessions.byID, request.ReplaceSession)
				delete(pluginUISessions.byToken, previousHash)
			}
		}
	}
	pluginUISessions.byToken[hash] = session
	pluginUISessions.byID[session.ID] = hash
	pluginUISessions.Unlock()

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(pluginUISessionResponse{
		Token:           token,
		SessionID:       session.ID,
		PluginURI:       session.PluginURI,
		ExpiresAt:       session.ExpiresAt.UnixMilli(),
		ProtocolVersion: pluginUIAuthProtocolVersion,
	})
}

func deletePluginUISession(w http.ResponseWriter, r *http.Request) {
	revokePluginUISession(mux.Vars(r)["session"])
	w.WriteHeader(http.StatusNoContent)
}

func writePluginUIAuthError(w http.ResponseWriter, status int, authError string) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-SPR-Auth-Error", authError)
	w.Header().Set("WWW-Authenticate", fmt.Sprintf(`Bearer realm="spr-plugin-ui", error="%s"`, authError))
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": authError})
}
