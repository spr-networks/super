package main

import (
	crand "crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	//	"fmt"
	"log"
	"strings"
	//	"net"
	"net/http"
	//	"sync"
	"encoding/binary"
)
import (
	"github.com/gorilla/mux"

	"github.com/duo-labs/webauthn.io/session"
	"github.com/duo-labs/webauthn/protocol"
	"github.com/duo-labs/webauthn/webauthn"
)

type User struct {
	id          uint64
	username    string
	credentials []webauthn.Credential
}

//webauthn PoC based off of https://github.com/hbolimovsky/webauthn-example

type webauthnconfig struct {
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

func (auth *webauthnconfig) BeginRegistration(w http.ResponseWriter, r *http.Request) {
	vals := r.URL.Query()
	usernames, ok := vals["username"]

	if !ok {
		w.Header().Set("Content-Type", "application/json")
		http.Error(w, "must supply a valid username i.e. admin", http.StatusBadRequest)
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

func (auth *webauthnconfig) ExtractRequestToken(r *http.Request) string {
	authorizationHeader := r.Header.Get("authorization")
	if authorizationHeader != "" {
		bearerToken := strings.Split(authorizationHeader, " ")
		if len(bearerToken) == 2 {
			return bearerToken[1]
		}
	}
	return ""
}

func (auth *webauthnconfig) ExtractSessionData(r *http.Request) (*webauthn.SessionData, *User) {
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

func (auth *webauthnconfig) FinishRegistration(w http.ResponseWriter, r *http.Request) {
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

func (auth *webauthnconfig) BeginLogin(w http.ResponseWriter, r *http.Request) {
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

func (auth *webauthnconfig) FinishLogin(w http.ResponseWriter, r *http.Request) {

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

func (auth *webauthnconfig) webAuthN(authenticatedNext *mux.Router, publicNext *mux.Router) http.HandlerFunc {
	webauth_router := mux.NewRouter().StrictSlash(true)
	webauth_router.HandleFunc("/register/", auth.BeginRegistration).Methods("GET", "OPTIONS")
	webauth_router.HandleFunc("/register/", auth.FinishRegistration).Methods("POST", "OPTIONS")
	webauth_router.HandleFunc("/login/", auth.BeginLogin).Methods("GET", "OPTIONS")
	webauth_router.HandleFunc("/login/", auth.FinishLogin).Methods("POST", "OPTIONS")

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var matchInfo mux.RouteMatch
		if publicNext.Match(r, &matchInfo) {
			publicNext.ServeHTTP(w, r)
			return
		}

		if webauth_router.Match(r, &matchInfo) {
			webauth_router.ServeHTTP(w, r)
			return
		}

		token := auth.ExtractRequestToken(r)

		if token != "" {
			_, exists := auth.authMap[token]
			if exists {
				authenticatedNext.ServeHTTP(w, r)
				return
			}
		}
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	})
}

type authconfig struct {
	username string
	password string
}

//https://www.alexedwards.net/blog/basic-authentication-in-go
func (auth *authconfig) basicAuth(authenticatedNext *mux.Router, publicNext *mux.Router) http.HandlerFunc {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var matchInfo mux.RouteMatch

		if publicNext.Match(r, &matchInfo) {
			publicNext.ServeHTTP(w, r)
			return
		}

		username, password, ok := r.BasicAuth()
		if ok {
			usernameHash := sha256.Sum256([]byte(username))
			passwordHash := sha256.Sum256([]byte(password))
			expectedUsernameHash := sha256.Sum256([]byte(auth.username))
			expectedPasswordHash := sha256.Sum256([]byte(auth.password))
			usernameMatch := (subtle.ConstantTimeCompare(usernameHash[:], expectedUsernameHash[:]) == 1)
			passwordMatch := (subtle.ConstantTimeCompare(passwordHash[:], expectedPasswordHash[:]) == 1)
			if usernameMatch && passwordMatch {
				authenticatedNext.ServeHTTP(w, r)
				return
			}
		}

		w.Header().Set("WWW-Authenticate", `Basic realm="restricted", charset="UTF-8"`)
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	})
}
