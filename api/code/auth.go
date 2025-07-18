package main

import (
	crand "crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
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
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
	"github.com/pquerna/otp/totp"
)

var AuthUsersFile = TEST_PREFIX + "/configs/auth/auth_users.json"
var AuthTokensFile = TEST_PREFIX + "/configs/auth/auth_tokens.json"
var OTPSettingsFile = TEST_PREFIX + "/configs/auth/otp_settings.json"
var WebAuthnOtpFile = TEST_PREFIX + "/state/api/webauthn_otp"
var AuthWebAuthnFile = TEST_PREFIX + "/state/api/webauthn.json"
var Tokensmtx sync.Mutex

// OTP rate limiting
type OTPAttempt struct {
	Count       int
	LastAttempt time.Time
	LockedUntil time.Time
}

var otpAttempts = make(map[string]*OTPAttempt)
var otpAttemptsMtx sync.Mutex

const (
	maxOTPAttempts     = 5                // Maximum attempts before lockout
	otpLockoutDuration = 15 * time.Minute // Lockout duration
	otpAttemptWindow   = 1 * time.Minute  // Time window for rate limiting
)

type Token struct {
	Name        string
	Token       string
	Expire      int64
	ScopedPaths []string
}

type OTPUser struct {
	Name      string
	Secret    string
	Confirmed bool
	AlwaysOn  bool
}

type OTPUserRequest struct {
	Name           string
	Code           string
	UpdateAlwaysOn bool
	AlwaysOn       bool
}

type OTPSettings struct {
	OTPUsers           []OTPUser
	JWTDurationSeconds int64
}

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

func loadOTPWebauthN() int {
	data, err := os.ReadFile(WebAuthnOtpFile)
	if err == nil {
		result, err := strconv.Atoi(string(data))
		if err == nil {
			return result
		}
	}
	return 0
}

func saveOTPWebauthN(data int) {
	os.WriteFile(WebAuthnOtpFile, []byte(strconv.Itoa(data)), 0600)
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

func scopedPathMatch(method string, pathToMatch string, paths []string) bool {
	for _, entry := range paths {
		parts := strings.Split(entry, ":")
		if len(parts) > 1 {
			if !strings.HasPrefix(pathToMatch, parts[0]) {
				//prefix did not match, carry on
				continue
			}
			if parts[1] == "r" && method == http.MethodGet {
				return true
			} else if parts[1] == "r" {
				//wrong method. skip
				continue
			}
			//this falls through into failure.
			// :r is the only one that is valid right now
			// so we can ignore the others
		} else {
			if strings.HasPrefix(pathToMatch, entry) {
				return true
			}
		}
	}
	//no positive match
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
				if !scopedPathMatch(r.Method, r.URL.Path, t.ScopedPaths) {
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
				//NOTE: tokens dont check JWT OTP

				if authorizedToken(r, token) {
					SprbusPublish("auth:success", map[string]string{"type": "token", "name": tokenName, "reason": remoteIP(r) + ":" + "api", "ip": remoteIP(r)})
					authenticatedNext.ServeHTTP(w, r)
					return
				} else {
					reason = "unauthorized token"
				}
			} else {
				reason = "unknown token"
			}
		}

		redirect_validate := false

		//basic auth
		username, password, ok := r.BasicAuth()
		if ok {
			failType = "user"
			if authenticateUser(username, password) {
				//check if all user requests should have a JWT check, if so, use it.
				if shouldCheckOTPJWT(r, username) && !hasValidJwtOtpHeader(username, r) {
					reason = "invalid or missing JWT OTP"
					redirect_validate = true
				} else {
					SprbusPublish("auth:success", map[string]string{"type": "user", "username": username, "reason": remoteIP(r) + ":" + "api", "ip": remoteIP(r)})

					authenticatedNext.ServeHTTP(w, r)
					return
				}
			} else {
				reason = "bad password"
			}
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
			SprbusPublish("auth:failure", map[string]string{"reason": remoteIP(r) + ":" + reason, "type": failType, "name": tokenName + username, "ip": remoteIP(r)})

			if redirect_validate {
				http.Redirect(w, r, "/auth/validate", 302)
			} else {
				http.Error(w, "Unauthorized", http.StatusUnauthorized)
			}
			return
		} else {
			//last try public route
			if publicNext.Match(r, &matchInfo) {
				publicNext.ServeHTTP(w, r)
				return
			}
		}

		SprbusPublish("auth:failure", map[string]string{"reason": remoteIP(r) + ":" + "unknown route, no credentials", "type": failType, "name": tokenName + username, "ip": remoteIP(r)})
		if redirect_validate {
			http.Redirect(w, r, "/auth/validate", 302)
		} else {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
		}
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
	err = ioutil.WriteFile(AuthTokensFile, file, 0600)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(token)
}

func otpSaveLocked(settings OTPSettings) error {
	file, _ := json.MarshalIndent(settings, "", " ")
	return ioutil.WriteFile(OTPSettingsFile, file, 0600)
}

func otpLoadLocked() (OTPSettings, error) {
	settings := OTPSettings{}

	data, err := os.ReadFile(OTPSettingsFile)

	if err == nil {
		err = json.Unmarshal(data, &settings)
		if err == nil {
			if settings.JWTDurationSeconds != 0 {
				gJwtTokenExpireTime = time.Duration(settings.JWTDurationSeconds) * time.Second
			} else {
				gJwtTokenExpireTime = gJwtTokenExpireTimeDefault
			}

		}
	}

	return settings, err
}

type OTPStatus struct {
	State     string
	AlwaysOn  bool
	Confirmed bool
}

func otpStatus(w http.ResponseWriter, r *http.Request) {
	Tokensmtx.Lock()
	defer Tokensmtx.Unlock()

	settings, _ := otpLoadLocked()
	//ignore load error, and make a new file

	status := OTPStatus{}
	status.State = "unregistered"
	user := r.URL.Query().Get("name")

	for _, entry := range settings.OTPUsers {
		if entry.Name == user {
			status.State = "registered"
			if entry.Confirmed == false {
				status.State = "not yet validated"
			}
			status.AlwaysOn = entry.AlwaysOn
			status.Confirmed = entry.Confirmed
			break
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

func otpRegister(w http.ResponseWriter, r *http.Request) {
	Tokensmtx.Lock()
	defer Tokensmtx.Unlock()

	settings, _ := otpLoadLocked()
	//ignore load error, and make a new file

	otpUserReq := OTPUserRequest{}
	err := json.NewDecoder(r.Body).Decode(&otpUserReq)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if otpUserReq.Name != "admin" {
		http.Error(w, fmt.Errorf("Unsupported username for OTP").Error(), 400)
		return
	}

	code := otpUserReq.Code
	otpUser := OTPUser{}
	otpUser.Name = otpUserReq.Name

	// to update, if already configured, the code has to be valid
	current_secret := ""

	for _, entry := range settings.OTPUsers {
		if entry.Name == otpUser.Name && entry.Confirmed == true {
			current_secret = entry.Secret
			break
		}
	}

	if current_secret != "" {
		if code == "" || !totp.Validate(code, current_secret) {
			http.Error(w, fmt.Errorf("OTP setting already exists, and code did not match").Error(), 400)
			return
		}
	}

	if r.Method == http.MethodDelete {
		found := false
		for idx, entry := range settings.OTPUsers {
			if entry.Name == otpUser.Name {
				settings.OTPUsers = append(settings.OTPUsers[:idx], settings.OTPUsers[idx+1:]...)
				found = true
				break
			}
		}

		if !found {
			http.Error(w, "Not found", 404)
			return
		}
	} else {
		//generate a new token
		key, err := totp.Generate(totp.GenerateOpts{
			Issuer:      "SPR-OTP",
			AccountName: otpUser.Name,
		})

		otpUser.Secret = key.Secret()
		if otpUser.Secret == "" {
			http.Error(w, fmt.Errorf("OTP setting failed to make secret").Error(), 400)
			return
		}

		//remove old entry
		for idx, entry := range settings.OTPUsers {
			if entry.Name == otpUser.Name {
				settings.OTPUsers = append(settings.OTPUsers[:idx], settings.OTPUsers[idx+1:]...)
				break
			}
		}
		settings.OTPUsers = append(settings.OTPUsers, otpUser)

		err = otpSaveLocked(settings)
		if err != nil {
			http.Error(w, fmt.Errorf("OTP setting failed to save").Error(), 400)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(settings)
	}

	//falls through to 200
}

const gJwtTokenExpireTimeDefault = 1 * time.Hour

var (
	gJwtOtpSecret       = []byte{}
	gJwtTokenExpireTime = gJwtTokenExpireTimeDefault
	gJwtOtpHeader       = "X-JWT-OTP"
)

func validateOTP(w http.ResponseWriter, r *http.Request) (bool, string, error) {
	settings, err := otpLoadLocked()
	if err != nil {
		return false, "", err
	}

	otpUserReq := OTPUserRequest{}
	err = json.NewDecoder(r.Body).Decode(&otpUserReq)
	if err != nil {
		return false, "", err
	}

	if otpUserReq.Name != "admin" {
		err = fmt.Errorf("Unsupported username for OTP")
		return false, "", err
	}

	// Rate limiting check
	otpAttemptsMtx.Lock()
	defer otpAttemptsMtx.Unlock()

	// Cleanup old attempts while we have the lock
	cleanupOTPAttemptsLocked()

	attempt, exists := otpAttempts[otpUserReq.Name]
	if !exists {
		attempt = new(OTPAttempt)
		otpAttempts[otpUserReq.Name] = attempt
	}

	// Check if account is locked
	if time.Now().Before(attempt.LockedUntil) {
		remainingTime := attempt.LockedUntil.Sub(time.Now())
		return false, "", fmt.Errorf("Account locked. Try again in %v", remainingTime.Round(time.Second))
	}

	// Reset counter if outside the time window
	if time.Since(attempt.LastAttempt) > otpAttemptWindow {
		attempt.Count = 0
	}

	// Check rate limit
	if attempt.Count >= maxOTPAttempts {
		attempt.LockedUntil = time.Now().Add(otpLockoutDuration)
		log.Printf("OTP rate limit exceeded for user %s from IP %s", otpUserReq.Name, r.RemoteAddr)
		return false, "", fmt.Errorf("Too many attempts. Account locked for %v", otpLockoutDuration)
	}

	attempt.Count++
	attempt.LastAttempt = time.Now()

	code := otpUserReq.Code
	current_secret := ""
	update := false
	for idx, entry := range settings.OTPUsers {
		if entry.Name == otpUserReq.Name {
			current_secret = entry.Secret
			confirmed := entry.Confirmed
			if !confirmed {
				update = true
			}
			settings.OTPUsers[idx].Confirmed = true
			if otpUserReq.UpdateAlwaysOn {
				if settings.OTPUsers[idx].AlwaysOn != otpUserReq.AlwaysOn {
					update = true
				}
				settings.OTPUsers[idx].AlwaysOn = otpUserReq.AlwaysOn
			}

			break
		}
	}

	if current_secret == "" {
		return false, "", fmt.Errorf("Missing OTP Enrollment")
	}

	if code == "" || !totp.Validate(code, current_secret) {
		return false, "", fmt.Errorf("Invalid OTP Code")
	}

	if update {
		//update confirmed state to True
		otpSaveLocked(settings)
	}

	// Reset attempt counter on successful validation
	delete(otpAttempts, otpUserReq.Name)
	return true, otpUserReq.Name, nil
}

func initJwtOtpSecret() {
	if len(gJwtOtpSecret) != 32 {
		b := make([]byte, 32)
		n, err := crand.Read(b) // Read random bytes into the byte slice
		if err == nil && n == 32 {
			gJwtOtpSecret = b
		}
	}
}

func cleanupOTPAttemptsLocked() {
	// Must be called with otpAttemptsMtx already locked
	now := time.Now()
	for user, attempt := range otpAttempts {
		// Remove entries that are no longer locked and haven't been used recently
		if now.After(attempt.LockedUntil) && time.Since(attempt.LastAttempt) > otpAttemptWindow {
			delete(otpAttempts, user)
		}
	}
}

func initAuth() {
	initJwtOtpSecret()
}

func generateOTPToken(w http.ResponseWriter, r *http.Request) {
	Tokensmtx.Lock()
	defer Tokensmtx.Unlock()

	isValid, user, err := validateOTP(w, r)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if !isValid {
		http.Error(w, "OTP Validation Failed", 400)
		return
	}

	if len(gJwtOtpSecret) != 32 {
		http.Error(w, "JWT OTP Setup Failed", 400)
		return
	}

	claims := &jwt.RegisteredClaims{
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(gJwtTokenExpireTime)),
		Issuer:    "SPR-OTP",
		Subject:   user,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(gJwtOtpSecret))
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tokenString)
}

func hasValidJwtOtpHeader(username string, r *http.Request) bool {
	jwtOtpHeaderString := r.Header.Get(gJwtOtpHeader)
	if jwtOtpHeaderString == "" {
		log.Println("missing JWT Header for validation")
		return false
	}

	return validateJwt(username, jwtOtpHeaderString)
}

func validateJwt(username string, jwtString string) bool {
	// Parsing the token
	token, err := jwt.Parse(jwtString, func(token *jwt.Token) (interface{}, error) {
		// Validating the algorithm used is what you expect
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("Unexpected signing method: %v", token.Header["alg"])
		}
		return gJwtOtpSecret, nil
	})

	if err != nil {
		log.Println("nwt Parse failure", err)
		return false
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		//double check issuer matches and subject is the correct username
		if claims["iss"] == "SPR-OTP" && claims["sub"] == username {
			return true
		} else {
			log.Println("JWT Unknown issuer/subject")
		}
	} else {
		log.Println("Invalid JWT Token")
	}

	return false
}

func testJWTOTP(w http.ResponseWriter, r *http.Request) {
	//200fallthru
}

func applyJwtOtpCheck(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		username, _, ok := r.BasicAuth()
		if !ok {
			http.Error(w, "Missing username", 401)
			return
		}

		if !hasValidJwtOtpHeader(username, r) {
			http.Error(w, "Invalid JWT", 401)
			return
		}
		handler(w, r)
	}
}

func shouldCheckOTPJWT(r *http.Request, username string) bool {

	if r.URL.Path == "/otp_validate" {
		return false
	}

	settings, err := otpLoadLocked()
	if err == nil {
		for _, entry := range settings.OTPUsers {
			if entry.Name == username && entry.AlwaysOn == true {
				return true
			}
		}
	}
	return false
}

func generateOrGetToken(name string, paths []string) (Token, error) {
	value := genBearerToken()
	new_token := Token{name, value, 0, paths}

	Tokensmtx.Lock()
	defer Tokensmtx.Unlock()

	tokens := []Token{}
	data, err := os.ReadFile(AuthTokensFile)

	if err == nil {
		err = json.Unmarshal(data, &tokens)
	}

	if err != nil {
		return new_token, err
	}

	foundToken := false
	if err == nil {
		_ = json.Unmarshal(data, &tokens)
		for _, token := range tokens {
			if token.Name == new_token.Name {
				//re-use the PFW token
				new_token = token
				foundToken = true
				break
			}
		}
	}

	if !foundToken {
		//add the generated token and save it to the token file
		tokens = append(tokens, new_token)
		file, _ := json.MarshalIndent(tokens, "", " ")
		err = ioutil.WriteFile(AuthTokensFile, file, 0600)
		if err != nil {
			fmt.Println("failed to write tokens file", err)
		}
	}

	return new_token, err
}
