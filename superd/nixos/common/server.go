package common

import (
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
)

var UnixPluginListener = "state/plugins/superd/socket"

func LogRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("DEBUGHTTP") != "" {
			fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		}
		handler.ServeHTTP(w, r)
	})
}

// Serve the API on the superd unix socket.
func Serve(handler http.Handler) error {
	os.MkdirAll(filepath.Dir(UnixPluginListener), 0755)
	os.Remove(UnixPluginListener)
	listener, err := net.Listen("unix", UnixPluginListener)
	if err != nil {
		return err
	}
	server := http.Server{Handler: LogRequest(handler)}
	return server.Serve(listener)
}
