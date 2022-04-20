package main

import (
	"encoding/json"
	"net"
	"net/http"
	"net/http/httputil"
	"regexp"
)

import (
	"github.com/gorilla/mux"
)

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

func updatePlugins(w http.ResponseWriter, r *http.Request) {
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config.Plugins)
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
}
