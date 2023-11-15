package main

import (
	"fmt"
	"net"
	"net/http"
	"os"
)

import (
	"github.com/gorilla/mux"
)

/*
//SPRBUS example
//to use, also uncomment the /state/api line in docker-compose.yml
import (
	"github.com/spr-networks/sprbus"
)

func handleDnsEvent(topic string, value string) {
	fmt.Println(topic, value)
}

func busListener() {
	go func() {
		for i := 30; i > 0; i-- {
			err := sprbus.HandleEvent("dns:serve:", handleDnsEvent)
			if err != nil {
				log.Println(err)
			}
			time.Sleep(3 * time.Second)
		}
		log.Fatal("failed to establish connection to sprbus")
	}()
}

*/

var UNIX_PLUGIN_LISTENER = "/state/plugins/sample_plugin/socket"


func pluginTest(w http.ResponseWriter, r *http.Request) {
	http.Error(w, "Not implemented", 400)
}

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		handler.ServeHTTP(w, r)
	})
}

func main() {
	unix_plugin_router := mux.NewRouter().StrictSlash(true)

	unix_plugin_router.HandleFunc("/test", pluginTest).Methods("GET")

	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}

	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

	pluginServer.Serve(unixPluginListener)
}
