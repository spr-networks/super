package main

import (
	crand "crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"io/ioutil"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)
import (
	"github.com/gorilla/mux"
	"github.com/spr-networks/sprbus"
)

var AuthUsersFile = TEST_PREFIX + "/configs/base/auth_users.json"
var AuthTokensFile = TEST_PREFIX + "/configs/base/auth_tokens.json"
var AuthOtpFile = TEST_PREFIX + "/state/api/webauthn_otp"
var AuthWebAuthnFile = TEST_PREFIX + "/state/api/webauthn.json"
var Tokensmtx sync.Mutex

func loadOTP() int {
	data, err := os.ReadFile(AuthOtpFile)
	if err == nil {
		result, err := strconv.Atoi(string(data))
		if err == nil {
			return result
		}
	}
	return 0
}

func saveOTP(data int) {
	os.WriteFile(AuthOtpFile, []byte(strconv.Itoa(data)), 0661)
}


type Token struct {
	Name        string
	Token       string
	Expire      int64
	ScopedPaths []string
}

func genBearerToken() string {
	pw := make([]byte, 32)
	n, err := crand.Read(pw)
	if n != 32 || err != nil {
		log.Fatal(err)
	}
	return base64.RawURLEncoding.EncodeToString(pw)
}

func ExtractRequestToken(r *http.Request) string {
	authorizationHeader := r.Header.Get("authorization")
	if authorizationHeader != "" {
		bearerToken := strings.Split(authorizationHeader, " ")
		if len(bearerToken) == 2 && bearerToken[0] == "Bearer" {
			return bearerToken[1]
		}
	}
	return ""
}


func authenticateToken(token string) bool {
	exists := false

	if !exists {

		Tokensmtx.Lock()
		//check api tokens
		tokens := []Token{}
		data, err := os.ReadFile(AuthTokensFile)
		Tokensmtx.Unlock()
		if err == nil {
			json.Unmarshal(data, &tokens)
		}

		for _, t := range tokens {
			if subtle.ConstantTimeCompare([]byte(token), []byte(t.Token)) == 1 {
				if t.Expire == 0 || t.Expire > time.Now().Unix() {
					exists = true
					break
				}
			}
		}

	}

	return exists
}

func scopedPathMatch(pathToMatch string, paths []string) bool {
	for _, entry := range paths {
		if strings.HasPrefix(pathToMatch, entry) {
			return true
		}
	}
	return false
}
func authorizedToken(r *http.Request, token string) bool {
	Tokensmtx.Lock()
	//check api tokens
	tokens := []Token{}
	data, err := os.ReadFile(AuthTokensFile)
	Tokensmtx.Unlock()
	if err == nil {
		json.Unmarshal(data, &tokens)
	}

	for _, t := range tokens {
		if subtle.ConstantTimeCompare([]byte(token), []byte(t.Token)) == 1 {
			if len(t.ScopedPaths) != 0 {
				if !scopedPathMatch(r.URL.Path, t.ScopedPaths) {
					//this url path did not match any of the scoped paths,
					// continue
					continue
				}
			}
			if t.Expire == 0 || t.Expire > time.Now().Unix() {
				sprbus.Publish("www:auth:token:success", map[string]int64{"expire": t.Expire})
				return true
			}
		}
	}

	sprbus.Publish("www:auth:token:fail", "")

	return false
}

func authenticateUser(username string, password string) bool {
	users := map[string]string{}
	data, err := os.ReadFile(AuthUsersFile)
	if err == nil {
		json.Unmarshal(data, &users)
	}

	pwEntry, exists := users[username]

	if exists {
		passwordHash := sha256.Sum256([]byte(password))
		expectedPasswordHash := sha256.Sum256([]byte(pwEntry))
		passwordMatch := (subtle.ConstantTimeCompare(passwordHash[:], expectedPasswordHash[:]) == 1)
		if passwordMatch {
			sprbus.Publish("www:auth:user:success", map[string]string{"username": username})
			return true
		}
	}

	sprbus.Publish("www:auth:user:fail", map[string]string{"username": username})

	return false
}

func Authenticate(authenticatedNext *mux.Router, publicNext *mux.Router, setupMode *mux.Router) http.HandlerFunc {

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		//Authenticated endpoints should not be cached.
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")

		var matchInfo mux.RouteMatch

		//api token
		token := ExtractRequestToken(r)
		if token != "" {
			if authenticateToken(token) && authorizedToken(r, token) {
				authenticatedNext.ServeHTTP(w, r)
				return
			}
		}

		//basic auth
		username, password, ok := r.BasicAuth()
		if ok {
			if authenticateUser(username, password) {
				authenticatedNext.ServeHTTP(w, r)
				return
			}
		}

		//check setup routes
		if isSetupMode() && setupMode.Match(r, &matchInfo) {
			setupMode.ServeHTTP(w, r)
			return
		}

		if authenticatedNext.Match(r, &matchInfo) || setupMode.Match(r, &matchInfo) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		} else {
			//last try public route
			if publicNext.Match(r, &matchInfo) {
				publicNext.ServeHTTP(w, r)
				return
			}
		}

		http.Error(w, "Unauthorized", http.StatusUnauthorized)
	})
}

func getAuthTokens(w http.ResponseWriter, r *http.Request) {
	tokens := []Token{}
	Tokensmtx.Lock()
	data, err := os.ReadFile(AuthTokensFile)
	Tokensmtx.Unlock()
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	err = json.Unmarshal(data, &tokens)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tokens)
}

func updateAuthTokens(w http.ResponseWriter, r *http.Request) {
	tokens := []Token{}
	Tokensmtx.Lock()
	defer Tokensmtx.Unlock()
	data, err := os.ReadFile(AuthTokensFile)

	if err == nil {
		_ = json.Unmarshal(data, &tokens)
	}

	token := Token{}
	err = json.NewDecoder(r.Body).Decode(&token)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if r.Method == http.MethodDelete {
		found := false
		for idx, entry := range tokens {
			if entry.Token == token.Token {
				tokens = append(tokens[:idx], tokens[idx+1:]...)
				found = true
				break
			}
		}

		if !found {
			http.Error(w, "Not found", 404)
			return
		}
	} else {
		found := false
		// no updating of tokens for now
		// TODO .Name for token desc
		/*
			for idx, entry := range tokens {
				if entry.Token == token.Token {
					found = true
					tokens[idx] = token
					break
				}
			}
		*/

		if !found {
			token.Token = genBearerToken()
			tokens = append(tokens, token)
		}
	}

	file, _ := json.MarshalIndent(tokens, "", " ")
	err = ioutil.WriteFile(AuthTokensFile, file, 0660)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(token)
}
