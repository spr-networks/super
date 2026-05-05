package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

const (
	PanelAddr = "127.0.0.1:9000"
	PanelUser = "spr"
	PanelPass = "spr-internal"
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

var (
	UNIX_PLUGIN_LISTENER = env("DYNDNS_SOCK", "/state/plugins/dyndns/dyndns_plugin")
	GoDyndnsConfigFile   = env("DYNDNS_CFG", "/configs/dyndns/godyndns.json")
	GoDnsBinary          = env("GODNS_BIN", "/godns")
)

func ensureWebPanel() {
	cfg := map[string]interface{}{}
	data, err := os.ReadFile(GoDyndnsConfigFile)
	if err == nil {
		_ = json.Unmarshal(data, &cfg)
	}
	cfg["web_panel"] = map[string]interface{}{
		"enabled":  true,
		"addr":     PanelAddr,
		"username": PanelUser,
		"password": PanelPass,
	}
	cfg["run_once"] = false
	if p, _ := cfg["providers"].(map[string]interface{}); len(p) == 0 {
		cfg["providers"] = map[string]interface{}{"Cloudflare": map[string]interface{}{"login_token": "placeholder"}}
	}
	if d, _ := cfg["domains"].([]interface{}); len(d) == 0 {
		cfg["domains"] = []map[string]interface{}{{"domain_name": "example.com", "sub_domains": []string{"www"}, "provider": "Cloudflare"}}
	}
	out, _ := json.MarshalIndent(cfg, "", "  ")
	os.MkdirAll(filepath.Dir(GoDyndnsConfigFile), 0700)
	os.WriteFile(GoDyndnsConfigFile, out, 0600)
}

func runGodns() {
	for {
		cmd := exec.Command(GoDnsBinary, "-c", GoDyndnsConfigFile)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Run()
		time.Sleep(2 * time.Second)
	}
}

func main() {
	ensureWebPanel()
	go runGodns()

	target, _ := url.Parse("http://" + PanelAddr)
	proxy := httputil.NewSingleHostReverseProxy(target)
	director := proxy.Director
	proxy.Director = func(req *http.Request) {
		director(req)
		req.SetBasicAuth(PanelUser, PanelPass)
	}
	creds := base64.StdEncoding.EncodeToString([]byte(PanelUser + ":" + PanelPass))
	seed := []byte(`<script>try{if(!localStorage.getItem('credentials')){localStorage.setItem('credentials','` + creds + `')}}catch(e){}</script></head>`)
	proxy.ModifyResponse = func(resp *http.Response) error {
		if !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/html") {
			return nil
		}
		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			return err
		}
		body = bytes.Replace(body, []byte("</head>"), seed, 1)
		resp.Body = io.NopCloser(bytes.NewReader(body))
		resp.ContentLength = int64(len(body))
		resp.Header.Set("Content-Length", strconv.Itoa(len(body)))
		return nil
	}

	os.Remove(UNIX_PLUGIN_LISTENER)
	ln, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}
	http.Serve(ln, proxy)
}
