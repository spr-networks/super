package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net"
	"net/http"
	"net/http/httputil"
	"os/exec"
	"regexp"
	"strings"
)

import (
	"github.com/gorilla/mux"
)

var PlusUser = "lts-super-plus"
var PlusGitURL = "@github.com/spr-networks/pfw_extension"

func PluginProxy(config PluginConfig) (*httputil.ReverseProxy, error) {
	return &httputil.ReverseProxy{
		Director: func(req *http.Request) {
			req.URL.Scheme = "http"
			req.URL.Host = config.Name

			//Empty headers from the request
			//SECURITY benefit: API extensions do not receive credentials
			req.Header = http.Header{}
		},
		Transport: &http.Transport{
			Dial: func(network, addr string) (net.Conn, error) {
				return net.Dial("unix", config.UnixPath)
			},
		},
	}, nil
}

func PluginRequestHandler(proxy *httputil.ReverseProxy) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		rest := mux.Vars(r)["rest"]
		if rest != "" {
			r.URL.Path = "/" + rest
		}
		proxy.ServeHTTP(w, r)
	}
}

func getPlugins(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	//= []PluginConfig
	json.NewEncoder(w).Encode(config.Plugins)
}

func updatePlugins(router *mux.Router) func(http.ResponseWriter, *http.Request) {
	return func(w http.ResponseWriter, r *http.Request) {
		name := mux.Vars(r)["name"]
		name = trimLower(name)

		if name == "" {
			http.Error(w, "Invalid device name", 400)
			return
		}

		plugin := PluginConfig{}
		err := json.NewDecoder(r.Body).Decode(&plugin)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		if r.Method == http.MethodDelete {
			found := false
			for idx, entry := range config.Plugins {
				if entry.Name == name {
					config.Plugins = append(config.Plugins[:idx], config.Plugins[idx+1:]...)
					found = true
					break
				}
			}

			if !found {
				http.Error(w, "Not found", 404)
				return
			}
		} else {
			// validate
			validName := regexp.MustCompile(`^[A-Za-z0-9\-]+$`).MatchString
			validURI := regexp.MustCompile(`^[A-Za-z0-9\/\-]+$`).MatchString
			validUnixPath := regexp.MustCompile(`^[A-Za-z0-9\/\-\._]+$`).MatchString

			if !validName(plugin.Name) {
				http.Error(w, "Invalid Name", 400)
				return
			}

			if !validURI(plugin.URI) {
				http.Error(w, "Invalid URI", 400)
				return
			}

			if !validUnixPath(plugin.UnixPath) {
				http.Error(w, "Invalid UnixPath", 400)
				return
			}

			// check if exists -- if so update, else create a new entry
			found := false
			for idx, entry := range config.Plugins {
				if entry.Name == name || entry.Name == plugin.Name {
					found = true
					config.Plugins[idx] = plugin
					break
				}
			}

			if !found {
				config.Plugins = append(config.Plugins, plugin)
			}
		}

		saveConfig()
		PluginRoutes(router)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(config.Plugins)
	}
}

func PluginRoutes(external_router_authenticated *mux.Router) {
	for _, entry := range config.Plugins {
		if !entry.Enabled {
			continue
		}

		proxy, err := PluginProxy(entry)
		if err != nil {
			panic(err)
		}

		external_router_authenticated.HandleFunc("/plugins/"+entry.URI+"/", PluginRequestHandler(proxy))
		external_router_authenticated.HandleFunc("/plugins/"+entry.URI+"/"+"{rest:.*}", PluginRequestHandler(proxy))
	}

	//log into GHCR for PLUS
	ghcrSuperdLogin()
}

// PLUS feature support

func validPlusToken(token string) bool {
	cmd := exec.Command("git", "ls-remote", "https://"+PlusUser+":"+token+"@"+PlusGitURL)
	stdout, err := cmd.Output()

	if err != nil {
		fmt.Println("git ls-remote failed", err)
		return false
	}

	if strings.Contains(string(stdout), "HEAD") {
		return true
	}

	return false
}

func plusToken(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		w.Header().Set("Content-Type", "application/json")
		if config.PlusToken == "" {
			http.Error(w, "PLUS Token not set", 404)
			return
		}
		//write the PLUS Token
		json.NewEncoder(w).Encode(config.PlusToken)
		return
	}

	//PUT
	token := ""
	err := json.NewDecoder(r.Body).Decode(&token)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if validPlusToken(token) {
		config.PlusToken = token
		saveConfig()
	}

	http.Error(w, "Invalid token", 400)
	return
}

func getSuperdClient() http.Client {
	c := http.Client{}
	c.Transport = &http.Transport{
		Dial: func(network, addr string) (net.Conn, error) {
			return net.Dial("unix", SuperdSocketPath)
		},
	}
	return c
}

func ghcrSuperdLogin() bool {
	if config.PlusToken == "" {
		return false
	}

	append := "?username=" + PlusUser + "&secret=" + config.PlusToken

	req, err := http.NewRequest(http.MethodGet, "http://localhost/ghcr_auth"+append, nil)
	if err != nil {
		return false
	}

	c := getSuperdClient()

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println("superd request failed", err)
		return false
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		fmt.Println("ghcr login failed", resp.StatusCode)
		return false
	}

	return true
}

func downloadPlus() bool {
	if config.PlusToken == "" {
		return false
	}

	//in the future, the list of extensions can be pulled /queried dynamically

	extensions := []string{"https://" + PlusUser + ":" + config.PlusToken + "@" + PlusGitURL}

	for _, ext := range extensions {
		req, err := http.NewRequest(http.MethodGet, "http://localhost/update_git?git_url="+ext, nil)
		if err != nil {
			return false
		}

		c := getSuperdClient()

		resp, err := c.Do(req)
		if err != nil {
			fmt.Println("superd request failed", err)
			return false
		}

		defer resp.Body.Close()
		_, err = ioutil.ReadAll(resp.Body)

		if resp.StatusCode != http.StatusOK {
			fmt.Println("failed to download extension: "+ext, resp.StatusCode)
			return false
		}
	}

	return true
}

func startPFWExtension() bool {
	//in the future, the list of extensions can be pulled /queried dynamically

	req, err := http.NewRequest(http.MethodGet, "http://localhost/start?compose_file=plugins/plus/pfw_extension/docker-compose.yml", nil)
	if err != nil {
		return false
	}

	c := getSuperdClient()

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println("superd request failed", err)
		return false
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		fmt.Println("failed to start pfw extension", resp.StatusCode)
		return false
	}

	return true
}

func updatePFWExtension() bool {
	//in the future, the list of extensions can be pulled /queried dynamically
	req, err := http.NewRequest(http.MethodGet, "http://localhost/update?compose_file=plugins/plus/pfw_extension/docker-compose.yml", nil)
	if err != nil {
		return false
	}

	c := getSuperdClient()

	resp, err := c.Do(req)
	if err != nil {
		fmt.Println("superd request failed", err)
		return false
	}

	defer resp.Body.Close()
	_, err = ioutil.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		fmt.Println("failed to update pfw extension", resp.StatusCode)
		return false
	}

	return true
}
