package main

import (
	crand "crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"io"
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

var AuthUsersFile = TEST_PREFIX + "/configs/auth/auth_users.json"
var AuthTokensFile = TEST_PREFIX + "/configs/auth/auth_tokens.json"

var AuthOtpFile = TEST_PREFIX + "/state/api/webauthn_otp"
var AuthWebAuthnFile = TEST_PREFIX + "/state/api/webauthn.json"
var Tokensmtx sync.Mutex

func makeDstIfMissing(destFilePath string, srcFilePath string) {

	if _, err := os.Stat(destFilePath); os.IsNotExist(err) {
		srcFile, err := os.Open(srcFilePath)
		if err != nil {
			log.Println("[-] Auth Migration: No previous file found " + srcFilePath)
			return
		}
		defer srcFile.Close()

		destFile, err := os.Create(destFilePath)
		if err != nil {
			log.Println("[-] Auth Migration: could not make destination " + destFilePath)
			return
		}
		defer destFile.Close()

		_, err = io.Copy(destFile, srcFile)
		if err != nil {
			log.Println("[-] Auth Migration: could not make destination " + destFilePath)
			return
		}

		os.Remove(srcFilePath)
	}
}

func migrateAuthAPI() {
	var oldAuthUsersFile = TEST_PREFIX + "/configs/base/auth_users.json"
	var oldAuthTokensFile = TEST_PREFIX + "/configs/base/auth_tokens.json"

	makeDstIfMissing(AuthUsersFile, oldAuthUsersFile)
	makeDstIfMissing(AuthTokensFile, oldAuthTokensFile)
}

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

func authenticateToken(token string) (bool, string, []string) {
	exists := false
	name := ""
	paths := []string{}

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
					name = t.Name
					paths = t.ScopedPaths
					break
				}
			}
		}

	}

	return exists, name, paths
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
				return true
			}
		}
	}

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
			return true
		}
	}

	return false
}

func Authenticate(authenticatedNext *mux.Router, publicNext *mux.Router, setupMode *mux.Router) http.HandlerFunc {

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		//Authenticated endpoints should not be cached.
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")

		var matchInfo mux.RouteMatch

		reason := ""
		//api token
		failType := "token"
		token := ExtractRequestToken(r)
		tokenName := ""
		if token != "" {
			goodToken, tokenName, _ := authenticateToken(token)
			if goodToken {
				if authorizedToken(r, token) {
					sprbus.Publish("auth:success", map[string]string{"type": "token", "name": tokenName, "reason": "api"})
					authenticatedNext.ServeHTTP(w, r)
					return
				} else {
					reason = "unauthorized token"
				}
			} else {
				reason = "unknown token"
			}
		}

		//basic auth
		username, password, ok := r.BasicAuth()
		if ok {
			failType = "user"
			if authenticateUser(username, password) {
				sprbus.Publish("auth:success", map[string]string{"type": "user", "username": username, "reason": "api"})
				authenticatedNext.ServeHTTP(w, r)
				return
			}
			reason = "bad password"
		} else {
			if token == "" {
				reason = "no credentials"
			}
		}

		//check setup routes
		if isSetupMode() && setupMode.Match(r, &matchInfo) {
			setupMode.ServeHTTP(w, r)
			return
		}

		if authenticatedNext.Match(r, &matchInfo) || setupMode.Match(r, &matchInfo) {
			sprbus.Publish("auth:failure", map[string]string{"reason": reason, "type": failType, "name": tokenName + username})
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		} else {
			//last try public route
			if publicNext.Match(r, &matchInfo) {
				publicNext.ServeHTTP(w, r)
				return
			}
		}

		sprbus.Publish("auth:failure", map[string]string{"reason": "unknown route, no credentials", "type": failType, "name": tokenName + username})
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
