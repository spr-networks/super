package main

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
)

import (
	"github.com/gorilla/mux"
)

var UNIX_PLUGIN_LISTENER = "state/plugins/superd/socket"
var PlusAddons = "plugins/plus"

func getDefaultCompose() string {
	composeFile := "docker-compose.yml"
	envCompose := os.Getenv("COMPOSE_FILE")
	if envCompose != "" {
		composeFile = envCompose
	}
	return composeFile
}

func composeCommand(composeFile string, target string, command string, optional string) {

	if composeFile == "" {
		composeFile = getDefaultCompose()
	}

	if target != "" {
		if optional != "" {
			_, err := exec.Command("docker-compose", "-f", composeFile, command, optional, target).Output()
			if err != nil {
				fmt.Println("docker-compose "+command, composeFile, optional, target, "failed", err)
			} else {
				_, err := exec.Command("docker-compose", "-f", composeFile, command, target).Output()
				if err != nil {
					fmt.Println("docker-compose"+command, composeFile, "failed", err)
				}
			}
		}
	} else {
		_, err := exec.Command("docker-compose", "-f", composeFile, command).Output()
		if err != nil {
			fmt.Println("docker-compose", composeFile, command, "failed", err)
		}
	}
}

func update(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")
	go composeCommand(compose, target, "pull", "")
}

func start(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")
	go composeCommand(compose, target, "up", "-d")
}

func restart(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")

	//run restart
	go composeCommand(compose, target, "restart", "")
}

func ghcr_auth(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	secret := r.URL.Query().Get("secret")

	if username == "" || secret == "" {
		http.Error(w, "need username and secret parameters", 400)
		return
	}

	cmd := exec.Command("docker", "login", "ghcr.io", "-u", username, "--password-stdin")
	stdin, err := cmd.StdinPipe()
	if err != nil {
		fmt.Println(err) //replace with logger, or anything you want
		http.Error(w, "stdin error for docker login", 400)
		return
	}

	go func() {
		defer stdin.Close()
		io.WriteString(stdin, secret)
	}()

	out, err := cmd.Output()
	if err != nil {
		http.Error(w, "login command failed", 400)
		return
	}

	if strings.Contains(string(out), "login command failed") {
		http.Error(w, "bad credentials", 400)
		return
	}
}

var AddonsMtx sync.Mutex

func update_git(w http.ResponseWriter, r *http.Request) {
	AddonsMtx.Lock()
	defer AddonsMtx.Unlock()

	git_url := r.URL.Query().Get("git_url")

	if git_url == "" {
		http.Error(w, "need git_url parameter", 400)
		return
	}

	if _, err := os.Stat(PlusAddons); os.IsNotExist(err) {
		err := os.MkdirAll(PlusAddons, 0755)
		if err != nil {
			http.Error(w, "Could not create addons", 500)
			return
		}
	}

	chdir_count := 0

	err := os.Chdir(PlusAddons)
	if err == nil {
		chdir_count += 1
	} else {
		http.Error(w, "Could not find addons directory", 500)
		return
	}

	os.Setenv("GIT_TERMINAL_PROMPT", "0")
	out, _ := exec.Command("git", "clone", git_url).CombinedOutput()
	fmt.Println(string(out))

	if strings.Contains(string(out), "fatal") {
		if !strings.Contains(string(out), "already exists") {
			os.Chdir("../")
			http.Error(w, "Could not clone repository", 400)
			return
		}
	}

	basename := filepath.Base(git_url)
	err = os.Chdir(basename)

	if err == nil {
		chdir_count += 1
	} else {

	}

	out, _ = exec.Command("git", "pull").CombinedOutput()
	fmt.Println(string(out))

	if chdir_count == 2 {
		os.Chdir("../../../")
	} else if chdir_count == 1 {
		os.Chdir("../../")
	}

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
	unix_plugin_router.HandleFunc("/start", start).Methods("GET")
	unix_plugin_router.HandleFunc("/update", update).Methods("GET")

	unix_plugin_router.HandleFunc("/ghcr_auth", ghcr_auth).Methods("GET")
	unix_plugin_router.HandleFunc("/update_git", update_git).Methods("GET")

	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}
	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

	pluginServer.Serve(unixPluginListener)
}
