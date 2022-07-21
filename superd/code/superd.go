package main

import (
  "os"
  "fmt"
  "net"
  "net/http"
  "os/exec"
)

import (
	"github.com/gorilla/mux"
)


var UNIX_PLUGIN_LISTENER = "state/plugins/superd/socket"

func restartServices(target string) {

  composeFile := "docker-compose-prebuilt.yml"
  envCompose := os.Getenv("COMPOSE_FILE")
  if envCompose != "" {
    composeFile = envCompose
  }

  if target != "" {
    _, err := exec.Command("docker-compose", "-f", composeFile, "restart", target).Output()
    if err != nil {
      fmt.Println("docker-compose restart", composeFile, "failed", err)
    }
  } else {
    _, err := exec.Command("docker-compose", "-f", composeFile, "restart").Output()
    if err != nil {
      fmt.Println("docker-compose restart", composeFile, "failed", err)
    }
  }

}

func restart(w http.ResponseWriter, r *http.Request) {
  target := r.URL.Query().Get("service")

  //run restart
  go restartServices(target)

}

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		handler.ServeHTTP(w, r)
	})
}

func main() {

  os.MkdirAll(UNIX_PLUGIN_LISTENER, 0755)

  unix_plugin_router := mux.NewRouter().StrictSlash(true)
	unix_plugin_router.HandleFunc("/restart", restart).Methods("GET")
	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}
	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

  pluginServer.Serve(unixPluginListener)
}
