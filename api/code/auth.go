package main

import (
	crand "crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
)
import (
	"github.com/duo-labs/webauthn.io/session"
	"github.com/duo-labs/webauthn/protocol"
	"github.com/duo-labs/webauthn/webauthn"
	"github.com/gorilla/mux"
)

func loadOTP() int {
	data, err := os.ReadFile(TEST_PREFIX + "/state/api/webauthn_otp")
	if err == nil {
		result, err := strconv.Atoi(string(data))
		if err == nil {
			return result
		}
	}
	return 0
}

func saveOTP(data int) {
	os.WriteFile(TEST_PREFIX + "/state/api/webauthn_otp", []byte(strconv.Itoa(data)), 0661)
}

type User struct {
	id          uint64
	username    string
	credentials []webauthn.Credential
}

//webauthn PoC based off of https://github.com/hbolimovsky/webauthn-example

type authnconfig struct {
	sessionStore *session.Store
	webAuthn     *webauthn.WebAuthn

	//token -> webauth session mapping
	sessionMap map[string]*webauthn.SessionData
	//token -> username mapping
	regMap map[string]*User

	//username -> user mapping
	userMap map[string]*User

	//token to username mapping
	authMap map[string]*User
}

func genBearerToken() string {
	pw := make([]byte, 32)
	n, err := crand.Read(pw)
	if n != 32 || err != nil {
		log.Fatal(err)
	}
	return base64.RawURLEncoding.EncodeToString(pw)
}

func (u User) WebAuthnDisplayName() string {
	return u.username
}

func (u User) WebAuthnName() string {
	return u.username
}

func (u User) WebAuthnIcon() string {
	return ""
}

func (u User) WebAuthnCredentials() []webauthn.Credential {
	return u.credentials
}

func (u User) WebAuthnID() []byte {
	buf := make([]byte, binary.MaxVarintLen64)
	binary.PutUvarint(buf, uint64(u.id))
	return buf
}

func (u *User) AddCredential(cred webauthn.Credential) {
	u.credentials = append(u.credentials, cred)
}

func (auth *authnconfig) BeginRegistration(w http.ResponseWriter, r *http.Request) {
	vals := r.URL.Query()
	usernames, ok := vals["username"]

	if !ok {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, "must supply a valid username i.e. admin", http.StatusBadRequest)
		return
	}

	webAuthnOTP := loadOTP()
	if webAuthnOTP == 0 {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, "Use CLI to Generate OTP code to register a new device", http.StatusBadRequest)
		return
	}

	otpStr, ok := vals["otp"]
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, "Missing OTP Code", http.StatusBadRequest)
		return
	}

	//invalidate the OTP code immediately
	saveOTP(0)

	otp, err := strconv.Atoi(otpStr[0])
	if err != nil || otp != webAuthnOTP {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, "Wrong OTP Code", http.StatusBadRequest)
		return
	}

	username := usernames[0]

	user := &User{}
	//tbd get last user id and do + 1
	user.id = 0
	user.username = username

	token := genBearerToken()

	registerOptions := func(credCreationOpts *protocol.PublicKeyCredentialCreationOptions) {
		credCreationOpts.Extensions = protocol.AuthenticationExtensions{"SPR-Bearer": token}
	}

	options, sessionData, err := auth.webAuthn.BeginRegistration(user, registerOptions)

	if auth.sessionMap == nil {
		auth.sessionMap = map[string]*webauthn.SessionData{}
	}
	if auth.regMap == nil {
		auth.regMap = map[string]*User{}
	}

	auth.sessionMap[token] = sessionData
	auth.regMap[token] = user

	if err != nil {
		log.Println(err)
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(options)
}

func (auth *authnconfig) ExtractRequestToken(r *http.Request) string {
	authorizationHeader := r.Header.Get("authorization")
	if authorizationHeader != "" {
		bearerToken := strings.Split(authorizationHeader, " ")
		if len(bearerToken) == 2 && bearerToken[0] == "Bearer" {
			return bearerToken[1]
		}
	}
	return ""
}

func (auth *authnconfig) ExtractSessionData(r *http.Request) (*webauthn.SessionData, *User) {
	bearerToken := auth.ExtractRequestToken(r)
	sessionData, exists := auth.sessionMap[bearerToken]
	if exists {
		user, exists := auth.regMap[bearerToken]
		if exists {
			return sessionData, user
		}
	}
	return nil, nil
}

func (auth *authnconfig) FinishRegistration(w http.ResponseWriter, r *http.Request) {
	sessionData, user := auth.ExtractSessionData(r)

	if sessionData == nil {
		http.Error(w, "no registration in progress", 400)
		return
	}

	if user == nil {
		http.Error(w, "user is missing", 400)
		return
	}

	credential, err := auth.webAuthn.FinishRegistration(user, *sessionData, r)

	if err != nil {
		log.Println(err)
		http.Error(w, err.Error(), 400)
		return
	}

	user.AddCredential(*credential)
	if auth.userMap == nil {
		auth.userMap = map[string]*User{}
	}
	auth.userMap[user.username] = user

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode("success")
}

func (auth *authnconfig) BeginLogin(w http.ResponseWriter, r *http.Request) {
	vals := r.URL.Query()
	usernames, ok := vals["username"]
	if !ok {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, "must supply a valid username i.e. admin", http.StatusBadRequest)
		return
	}
	username := usernames[0]

	user, exists := auth.userMap[username]
	if !exists {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, "User not found", http.StatusBadRequest)
		return
	}

	token := genBearerToken()

	loginOptions := func(credCreationOpts *protocol.PublicKeyCredentialRequestOptions) {
		credCreationOpts.Extensions = protocol.AuthenticationExtensions{"SPR-Bearer": token}
	}

	// generate PublicKeyCredentialRequestOptions, session data
	options, sessionData, err := auth.webAuthn.BeginLogin(user, loginOptions)
	if err != nil {
		log.Println(err)
		http.Error(w, err.Error(), 400)
		return
	}

	if auth.sessionMap == nil {
		auth.sessionMap = map[string]*webauthn.SessionData{}
	}

	auth.sessionMap[token] = sessionData
	auth.regMap[token] = user

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(options)
}

func (auth *authnconfig) FinishLogin(w http.ResponseWriter, r *http.Request) {

	sessionData, user := auth.ExtractSessionData(r)

	if sessionData == nil {
		http.Error(w, "no login in progress", 400)
		return
	}

	if user == nil {
		http.Error(w, "user not found", 400)
		return
	}

	credential, err := auth.webAuthn.FinishLogin(user, *sessionData, r)

	if err != nil {
		log.Println(err)
		http.Error(w, err.Error(), 400)
		return
	}

	user.AddCredential(*credential)

	//add bearer token to authenticated users etc
	if auth.authMap == nil {
		auth.authMap = map[string]*User{}
	}
	auth.authMap[auth.ExtractRequestToken(r)] = user

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode("success")
}

func (auth *authnconfig) authenticateToken(token string) bool {
	// check webauthn
	_, exists := auth.authMap[token]

	if !exists {
		//check api tokens
		tokens := []string{}
		data, err := os.ReadFile(TEST_PREFIX + "/state/api/auth_tokens")
		if err == nil {
			json.Unmarshal(data, &tokens)
		}

		for _, s := range tokens {
			if subtle.ConstantTimeCompare([]byte(token), []byte(s)) == 1 {
				exists = true
				break
			}
		}

	}

	return exists
}

func (auth *authnconfig) authenticateUser(username string, password string) bool {
	users := map[string]string{}
	data, err := os.ReadFile(TEST_PREFIX + "/state/api/auth_users")
	if err == nil {
		json.Unmarshal(data, &users)
	}

	pwEntry, exists := users[username]

	if exists {
		passwordHash := sha256.Sum256([]byte(password))
		expectedPasswordHash := sha256.Sum256([]byte(pwEntry))
		passwordMatch := (subtle.ConstantTimeCompare(passwordHash[:], expectedPasswordHash[:]) == 1)
		if passwordMatch {
			return true
		}
	}
	return false
}

func (auth *authnconfig) Authenticate(authenticatedNext *mux.Router, publicNext *mux.Router) http.HandlerFunc {
	webauth_router := mux.NewRouter().StrictSlash(true)

	webauth_router.HandleFunc("/register/", auth.BeginRegistration).Methods("GET", "OPTIONS")
	webauth_router.HandleFunc("/register/", auth.FinishRegistration).Methods("POST", "OPTIONS")
	webauth_router.HandleFunc("/login/", auth.BeginLogin).Methods("GET", "OPTIONS")
	webauth_router.HandleFunc("/login/", auth.FinishLogin).Methods("POST", "OPTIONS")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var matchInfo mux.RouteMatch

		/*
		// disable webauth code for now
		//first match webuath
		if webauth_router.Match(r, &matchInfo) {
			webauth_router.ServeHTTP(w, r)
			return
		}
		*/

		//next match api

		token := auth.ExtractRequestToken(r)

		if token != "" {
			if auth.authenticateToken(token) {
				authenticatedNext.ServeHTTP(w, r)
				return
			}
		}

		//check basic auth next
		//https://www.alexedwards.net/blog/basic-authentication-in-go
		username, password, ok := r.BasicAuth()
		if ok {
			if auth.authenticateUser(username, password) {
				authenticatedNext.ServeHTTP(w, r)
				return
			}
		}

		//last try public route
		if publicNext.Match(r, &matchInfo) {
			publicNext.ServeHTTP(w, r)
			return
		}

		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	})
}
