/*
 The superd service allows the API to manage container state with docker.

 It can:
 	- restart services
	- download predefined Plus containers

 It is highly privileged. Access to this container is the same as access to the host

*/
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

var ComposeAllowList = []string{"docker-compose.yml", "docker-compose-virt.yml", "plugins/plus/pfw_extension/docker-compose.yml"}

func getDefaultCompose() string {
	envCompose := os.Getenv("COMPOSE_FILE")
	if envCompose != "" {
		return envCompose
	}
	// when no SSID is set in configs/base/config.sh,
	// assume virtual SPR is running
	virtual_spr := os.Getenv("VIRTUAL_SPR")
	if virtual_spr != "" {
		return "docker-compose-virt.yml"
	}
	return "docker-compose.yml"
}

func composeCommand(composeFile string, target string, command string, optional string) {

	if composeFile == "" {
		composeFile = getDefaultCompose()
	}

	composeAllowed := false
	for _, entry := range ComposeAllowList {
		if entry == composeFile {
			composeAllowed = true
			break
		}
	}

	if composeAllowed == false {
		fmt.Println("Compose file path is not whitelisted")
		return
	}

	if target != "" {
		if optional != "" {
			_, err := exec.Command("docker-compose", "-f", composeFile, command, optional, target).Output()
			if err != nil {
				fmt.Println("docker-compose "+command, composeFile, optional, target, "failed", err)
			}
		} else {
			_, err := exec.Command("docker-compose", "-f", composeFile, command, target).Output()
			if err != nil {
				fmt.Println("docker-compose"+command, composeFile, "failed", err)
			}
		}
	} else {
		if optional != "" {
			_, err := exec.Command("docker-compose", "-f", composeFile, command, optional).Output()
			if err != nil {
				fmt.Println("docker-compose", composeFile, command, optional, "failed", err)
			}
		} else {
			_, err := exec.Command("docker-compose", "-f", composeFile, command).Output()
			if err != nil {
				fmt.Println("docker-compose", composeFile, command, "failed", err)
			}
		}
	}
}

func update(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")
	composeCommand(compose, target, "pull", "")
}

func start(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")
	composeCommand(compose, target, "up", "-d")
}

func stop(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")
	go composeCommand(compose, target, "stop", "")
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

	os.Chdir("/super")
	if _, err := os.Stat(PlusAddons); os.IsNotExist(err) {
		err := os.MkdirAll(PlusAddons, 0755)
		if err != nil {
			http.Error(w, "Could not create addons", 500)
			return
		}
	}

	err := os.Chdir(PlusAddons)
	if err != nil {
		http.Error(w, "Could not find addons directory", 500)
		os.Chdir("/super")
		return
	}

	os.Setenv("GIT_TERMINAL_PROMPT", "0")
	out, _ := exec.Command("git", "clone", git_url).CombinedOutput()
	fmt.Println(string(out))

	if strings.Contains(string(out), "fatal") {
		if !strings.Contains(string(out), "already exists") {
			http.Error(w, "Could not clone repository", 400)
			os.Chdir("/super")
			return
		}
	}

	basename := filepath.Base(git_url)
	err = os.Chdir(basename)

	if err != nil {
		http.Error(w, "Could not clone repository", 400)
		os.Chdir("/super")
		return
	}

	out, _ = exec.Command("git", "pull").CombinedOutput()
	fmt.Println(string(out))
	os.Chdir("/super")

}

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		handler.ServeHTTP(w, r)
	})
}

func getHostSuperDir() string {

	f := "'{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}'"

	cmd := exec.Command("docker", "inspect", "--format="+f, "superd")
	stdout, err := cmd.Output()

	if err != nil {
		fmt.Println("[-]", err)
		return ""
	}
	return strings.Trim(string(stdout), "'\n") + "/"
}

func main() {
	err := os.Chdir("/super")
	if err != nil {
		fmt.Println("[-] Could not chdir to super directory")
		return
	}

	hostSuperDir := getHostSuperDir()

	if hostSuperDir == "" {
		fmt.Println("[-] Failed to locate super install")
		return
	}

	os.Setenv("SUPERDIR", hostSuperDir)

	os.MkdirAll(UNIX_PLUGIN_LISTENER, 0755)

	unix_plugin_router := mux.NewRouter().StrictSlash(true)
	unix_plugin_router.HandleFunc("/restart", restart).Methods("GET")
	unix_plugin_router.HandleFunc("/start", start).Methods("GET")
	unix_plugin_router.HandleFunc("/update", update).Methods("GET")
	unix_plugin_router.HandleFunc("/stop", stop).Methods("GET")

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
