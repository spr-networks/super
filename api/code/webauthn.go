package main

import (
	"bytes"
	crand "crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

const (
	webauthnSessionTTL       = 3 * time.Minute
	webauthnMaxSessions      = 32
	webauthnMaxSessionsPerIP = 4
	webauthnLoginTokenExpiry = 30 * 24 * time.Hour
	webauthnLoginTokenPrefix = "webauthn:"
)

type WebAuthnCredentialEntry struct {
	Name       string
	CreatedAt  int64
	Credential webauthn.Credential
}

type WebAuthnUserEntry struct {
	Handle      []byte
	Credentials []WebAuthnCredentialEntry
}

type WebAuthnSettings struct {
	Users map[string]*WebAuthnUserEntry
}

type webAuthnUser struct {
	name   string
	handle []byte
	creds  []webauthn.Credential
}

func (u webAuthnUser) WebAuthnID() []byte                         { return u.handle }
func (u webAuthnUser) WebAuthnName() string                       { return u.name }
func (u webAuthnUser) WebAuthnDisplayName() string                { return u.name }
func (u webAuthnUser) WebAuthnCredentials() []webauthn.Credential { return u.creds }

func webauthnLoadLocked() WebAuthnSettings {
	settings := WebAuthnSettings{}
	data, err := os.ReadFile(AuthWebAuthnFile)
	if err == nil {
		json.Unmarshal(data, &settings)
	}
	if settings.Users == nil {
		settings.Users = map[string]*WebAuthnUserEntry{}
	}
	return settings
}

func webauthnSaveLocked(settings WebAuthnSettings) error {
	file, _ := json.MarshalIndent(settings, "", " ")
	return os.WriteFile(AuthWebAuthnFile, file, 0600)
}

func webauthnUserLocked(settings WebAuthnSettings, name string) (webAuthnUser, *WebAuthnUserEntry) {
	entry := settings.Users[name]
	if entry == nil {
		entry = &WebAuthnUserEntry{}
		settings.Users[name] = entry
	}
	if len(entry.Handle) != 64 {
		entry.Handle = make([]byte, 64)
		if n, err := crand.Read(entry.Handle); err != nil || n != 64 {
			log.Fatal("failed to generate webauthn user handle")
		}
	}
	user := webAuthnUser{name: name, handle: entry.Handle}
	for _, c := range entry.Credentials {
		user.creds = append(user.creds, c.Credential)
	}
	return user, entry
}

func webauthnStoreCredentialLocked(settings WebAuthnSettings, name string, credential *webauthn.Credential, credName string) error {
	if credential.Authenticator.CloneWarning {
		log.Println("webauthn: possible cloned authenticator for user", name)
	}
	_, entry := webauthnUserLocked(settings, name)
	for idx := range entry.Credentials {
		if bytes.Equal(entry.Credentials[idx].Credential.ID, credential.ID) {
			entry.Credentials[idx].Credential = *credential
			return webauthnSaveLocked(settings)
		}
	}
	entry.Credentials = append(entry.Credentials, WebAuthnCredentialEntry{credName, time.Now().Unix(), *credential})
	return webauthnSaveLocked(settings)
}

func webauthnStatusJSON(w http.ResponseWriter, settings WebAuthnSettings, name string) {
	creds := []map[string]interface{}{}
	if entry := settings.Users[name]; entry != nil {
		for _, c := range entry.Credentials {
			creds = append(creds, map[string]interface{}{
				"ID":        base64.RawURLEncoding.EncodeToString(c.Credential.ID),
				"Name":      c.Name,
				"CreatedAt": c.CreatedAt,
			})
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"Registered": len(creds) > 0, "Credentials": creds})
}

func webauthnRP(r *http.Request) (*webauthn.WebAuthn, error) {
	host := r.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	expected := scheme + "://" + r.Host
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = expected // native clients do not send Origin
	}
	canonical, err := protocol.FullyQualifiedOrigin(origin)
	if err != nil || canonical != origin || !protocol.IsOriginInHaystack(origin, []string{expected}) {
		return nil, fmt.Errorf("origin does not match request host")
	}
	return webauthn.New(&webauthn.Config{RPDisplayName: "SPR", RPID: host, RPOrigins: []string{origin}})
}

func requestWebauthn(w http.ResponseWriter, r *http.Request) *webauthn.WebAuthn {
	wa, err := webauthnRP(r)
	if err != nil {
		http.Error(w, err.Error(), 400)
	}
	return wa
}

type webauthnSession struct {
	kind    string
	user    string
	name    string
	data    *webauthn.SessionData
	expires time.Time
	client  string
}

var (
	webauthnSessions    = map[string]*webauthnSession{}
	webauthnSessionsMtx sync.Mutex
)

func webauthnTakeSession(r *http.Request, kind, id string) *webauthnSession {
	webauthnSessionsMtx.Lock()
	defer webauthnSessionsMtx.Unlock()
	s := webauthnSessions[id]
	delete(webauthnSessions, id)
	if id == "" ||
		s == nil ||
		s.kind != kind ||
		s.client != clientIP(r) ||
		time.Now().After(s.expires) {
		return nil
	}
	return s
}

func webauthnBeginReply(w http.ResponseWriter, r *http.Request, kind, user, name string, options interface{}, data *webauthn.SessionData) {
	webauthnSessionsMtx.Lock()
	now := time.Now()
	requestIP := clientIP(r)
	clientSessions := 0
	for id, s := range webauthnSessions {
		if now.After(s.expires) {
			delete(webauthnSessions, id)
			continue
		}
		if s.client == requestIP {
			clientSessions++
		}
	}
	if clientSessions >= webauthnMaxSessionsPerIP || len(webauthnSessions) >= webauthnMaxSessions {
		webauthnSessionsMtx.Unlock()
		http.Error(w, "too many pending webauthn sessions", 429)
		return
	}
	id := genBearerToken()
	webauthnSessions[id] = &webauthnSession{
		kind:    kind,
		user:    user,
		name:    name,
		data:    data,
		expires: now.Add(webauthnSessionTTL),
		client:  requestIP,
	}
	webauthnSessionsMtx.Unlock()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"Session": id, "Options": options})
}

func clientIP(r *http.Request) string {
	if host, _, err := net.SplitHostPort(r.RemoteAddr); err == nil {
		return host
	}
	return r.RemoteAddr
}

func webauthnStatus(w http.ResponseWriter, r *http.Request) {
	Tokensmtx.Lock()
	settings := webauthnLoadLocked()
	Tokensmtx.Unlock()
	webauthnStatusJSON(w, settings, "admin")
}

func webauthnRegisterBegin(w http.ResponseWriter, r *http.Request) {
	username := "admin" // the authenticated API currently has one user
	wa := requestWebauthn(w, r)
	if wa == nil {
		return
	}
	Tokensmtx.Lock()
	settings := webauthnLoadLocked()
	user, _ := webauthnUserLocked(settings, username)
	err := webauthnSaveLocked(settings)
	Tokensmtx.Unlock()
	if err != nil {
		http.Error(w, "failed to save webauthn settings", 400)
		return
	}
	exclusions := []protocol.CredentialDescriptor{}
	for _, c := range user.creds {
		exclusions = append(exclusions, c.Descriptor())
	}
	options, session, err := wa.BeginRegistration(user,
		webauthn.WithResidentKeyRequirement(protocol.ResidentKeyRequirementRequired),
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementRequired,
			UserVerification: protocol.VerificationRequired,
		}),
		webauthn.WithConveyancePreference(protocol.PreferNoAttestation),
		webauthn.WithExclusions(exclusions))
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	name := r.URL.Query().Get("name")
	if name == "" {
		name = "passkey"
	}
	webauthnBeginReply(w, r, "register", username, name, options, session)
}

func webauthnRegisterFinish(w http.ResponseWriter, r *http.Request) {
	sess := webauthnTakeSession(r, "register", r.URL.Query().Get("session"))
	if sess == nil {
		http.Error(w, "invalid or expired webauthn session", 400)
		return
	}
	wa := requestWebauthn(w, r)
	if wa == nil {
		return
	}
	parsed, err := protocol.ParseCredentialCreationResponse(r)
	if err != nil {
		http.Error(w, "webauthn registration failed", 400)
		return
	}
	Tokensmtx.Lock()
	defer Tokensmtx.Unlock()
	settings := webauthnLoadLocked()
	user, _ := webauthnUserLocked(settings, sess.user)
	credential, err := wa.CreateCredential(user, *sess.data, parsed)
	if err != nil {
		http.Error(w, "webauthn registration failed", 400)
		return
	}
	if webauthnStoreCredentialLocked(settings, sess.user, credential, sess.name) != nil {
		http.Error(w, "failed to save webauthn settings", 400)
		return
	}
	SprbusPublish("auth:webauthn:register", map[string]string{"username": sess.user, "credential": sess.name, "ip": remoteIP(r)})
	webauthnStatusJSON(w, settings, sess.user)
}

func webauthnDeleteCredential(w http.ResponseWriter, r *http.Request) {
	username := "admin"
	req := struct{ ID string }{}
	json.NewDecoder(r.Body).Decode(&req)
	credID, err := base64.RawURLEncoding.DecodeString(req.ID)
	if err != nil {
		http.Error(w, "invalid credential id", 400)
		return
	}
	Tokensmtx.Lock()
	defer Tokensmtx.Unlock()
	settings := webauthnLoadLocked()
	if entry := settings.Users[username]; entry != nil {
		for idx := range entry.Credentials {
			if bytes.Equal(entry.Credentials[idx].Credential.ID, credID) {
				name := entry.Credentials[idx].Name
				entry.Credentials = append(entry.Credentials[:idx], entry.Credentials[idx+1:]...)
				if webauthnSaveLocked(settings) != nil {
					http.Error(w, "failed to save webauthn settings", 400)
					return
				}
				SprbusPublish("auth:webauthn:delete", map[string]string{"username": username, "credential": name, "ip": remoteIP(r)})
				webauthnStatusJSON(w, settings, username)
				return
			}
		}
	}
	http.Error(w, "Not found", 404)
}

func webauthnValidateBegin(w http.ResponseWriter, r *http.Request) {
	username, _, ok := r.BasicAuth()
	if !ok || username != "admin" {
		http.Error(w, "Unsupported username for WebAuthn", 400)
		return
	}
	wa := requestWebauthn(w, r)
	if wa == nil {
		return
	}
	Tokensmtx.Lock()
	settings := webauthnLoadLocked()
	user, _ := webauthnUserLocked(settings, username)
	Tokensmtx.Unlock()
	if len(user.creds) == 0 {
		http.Error(w, "no passkeys registered", 400)
		return
	}
	options, session, err := wa.BeginLogin(user, webauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	webauthnBeginReply(w, r, "validate", username, "", options, session)
}

func webauthnValidateFinish(w http.ResponseWriter, r *http.Request) {
	username, _, ok := r.BasicAuth()
	sess := webauthnTakeSession(r, "validate", r.URL.Query().Get("session"))
	if !ok || sess == nil || sess.user != username {
		http.Error(w, "invalid or expired webauthn session", 400)
		return
	}
	wa := requestWebauthn(w, r)
	if wa == nil {
		return
	}
	parsed, err := protocol.ParseCredentialRequestResponse(r)
	if err != nil {
		http.Error(w, "webauthn validation failed", 400)
		return
	}
	Tokensmtx.Lock()
	settings := webauthnLoadLocked()
	user, _ := webauthnUserLocked(settings, sess.user)
	credential, err := wa.ValidateLogin(user, *sess.data, parsed)
	if err == nil {
		webauthnStoreCredentialLocked(settings, sess.user, credential, "")
	}
	Tokensmtx.Unlock()
	if err != nil {
		SprbusPublish("auth:failure", map[string]string{"reason": remoteIP(r) + ":" + "webauthn validation failed", "type": "user", "name": username, "ip": remoteIP(r)})
		http.Error(w, "webauthn validation failed", 400)
		return
	}
	tokenString, err := signJwtOtpToken(sess.user)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	SprbusPublish("auth:success", map[string]string{"type": "user", "username": username, "reason": remoteIP(r) + ":" + "webauthn", "ip": remoteIP(r)})
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tokenString)
}

func webauthnLoginBegin(w http.ResponseWriter, r *http.Request) {
	if authFailureRateLimited(authRateKey("webauthn", r)) {
		http.Error(w, "Too many attempts. Try again later", 429)
		return
	}
	wa := requestWebauthn(w, r)
	if wa == nil {
		return
	}
	Tokensmtx.Lock()
	settings := webauthnLoadLocked()
	Tokensmtx.Unlock()
	registered := false
	for _, entry := range settings.Users {
		registered = registered || len(entry.Credentials) > 0
	}
	if !registered {
		http.Error(w, "passkey login unavailable", 400)
		return
	}
	options, session, err := wa.BeginDiscoverableLogin(webauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	webauthnBeginReply(w, r, "login", "", "", options, session)
}

func webauthnLoginFinish(w http.ResponseWriter, r *http.Request) {
	rateKey := authRateKey("webauthn", r)
	if authFailureRateLimited(rateKey) {
		http.Error(w, "Too many attempts. Try again later", 429)
		return
	}
	sess := webauthnTakeSession(r, "login", r.URL.Query().Get("session"))
	if sess == nil {
		http.Error(w, "invalid or expired webauthn session", 400)
		return
	}
	wa := requestWebauthn(w, r)
	if wa == nil {
		return
	}
	parsed, err := protocol.ParseCredentialRequestResponse(r)
	if err != nil {
		http.Error(w, "webauthn login failed", 401)
		return
	}
	Tokensmtx.Lock()
	settings := webauthnLoadLocked()
	handler := func(rawID, userHandle []byte) (webauthn.User, error) {
		for name, entry := range settings.Users {
			if bytes.Equal(entry.Handle, userHandle) {
				user, _ := webauthnUserLocked(settings, name)
				return user, nil
			}
		}
		return nil, fmt.Errorf("unknown user handle")
	}
	waUser, credential, err := wa.ValidatePasskeyLogin(handler, *sess.data, parsed)
	username := ""
	if err == nil {
		username = waUser.(webAuthnUser).name
		webauthnStoreCredentialLocked(settings, username, credential, "")
	}
	Tokensmtx.Unlock()
	if err != nil {
		authFailureRateRecord(rateKey)
		SprbusPublish("auth:failure", map[string]string{"reason": remoteIP(r) + ":" + "webauthn login failed", "type": "user", "name": "webauthn", "ip": remoteIP(r)})
		http.Error(w, "webauthn login failed", 401)
		return
	}
	token, err := webauthnLoginToken(username)
	if err != nil {
		http.Error(w, "failed to save login token", 400)
		return
	}
	authFailureRateClear(rateKey)
	SprbusPublish("auth:success", map[string]string{"type": "user", "username": username, "reason": remoteIP(r) + ":" + "webauthn login", "ip": remoteIP(r)})
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"Name": username, "Token": token.Token, "Expire": token.Expire})
}

func webauthnLoginToken(name string) (Token, error) {
	newToken := Token{webauthnLoginTokenPrefix + name, genBearerToken(), time.Now().Add(webauthnLoginTokenExpiry).Unix(), nil}
	Tokensmtx.Lock()
	defer Tokensmtx.Unlock()
	tokens := []Token{}
	data, err := os.ReadFile(AuthTokensFile)
	if err == nil {
		json.Unmarshal(data, &tokens)
	}
	kept := []Token{}
	now := time.Now().Unix()
	for _, t := range tokens {
		if strings.HasPrefix(t.Name, webauthnLoginTokenPrefix) && t.Expire != 0 && t.Expire < now {
			continue
		}
		kept = append(kept, t)
	}
	kept = append(kept, newToken)
	return newToken, saveFileJSON(AuthTokensFile, kept)
}

func webauthnLogout(w http.ResponseWriter, r *http.Request) {
	token := ExtractRequestToken(r)
	Tokensmtx.Lock()
	tokens := []Token{}
	data, err := os.ReadFile(AuthTokensFile)
	if err == nil {
		json.Unmarshal(data, &tokens)
	}
	name := ""
	kept := []Token{}
	for _, t := range tokens {
		if strings.HasPrefix(t.Name, webauthnLoginTokenPrefix) &&
			subtle.ConstantTimeCompare([]byte(token), []byte(t.Token)) == 1 {
			name = t.Name
			continue
		}
		kept = append(kept, t)
	}
	if token == "" || name == "" {
		Tokensmtx.Unlock()
		http.Error(w, "Not found", 404)
		return
	}
	err = saveFileJSON(AuthTokensFile, kept)
	Tokensmtx.Unlock()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	WSCloseAll()
	SprbusPublish("auth:logout", map[string]string{"type": "token", "name": name, "ip": remoteIP(r)})
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(true)
}
