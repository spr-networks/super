/*
	 The superd service allows the API to manage container state with docker.

	 It can:
	 	- restart services
		- download predefined Plus containers

	 It is highly privileged. Access to this container is the same as access to the host
*/
package main

import (
	"bufio"
	"encoding/json"
	"bytes"
	"fmt"
	"io"
	"io/ioutil"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

import (
	"github.com/gorilla/mux"
)

var UNIX_PLUGIN_LISTENER = "state/plugins/superd/socket"
var PlusAddons = "plugins/plus"

var ComposeAllowList = []string{"docker-compose.yml", "docker-compose-virt.yml", "plugins/plus/pfw_extension/docker-compose.yml", "plugins/plus/mesh_extension/docker-compose.yml"}

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

func versionForRepository(path string) string {
	//git tag -l --sort=-creatordate  | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1
	cmd := exec.Command("git", "-C", path, "tag", "-l", "--sort=-creatordate")
	output, err := cmd.Output()
	if err != nil {
		fmt.Println("[-] version not found", err)
		panic(err)
	}

	scanner := bufio.NewScanner(strings.NewReader(string(output)))
	for scanner.Scan() {
		line := scanner.Text()
		if matched, _ := regexp.MatchString(`^v[0-9]+\.[0-9]+\.[0-9]+$`, line); matched {
			return strings.Trim(line, "'\n")
		}
	}

	fmt.Println("[-] version not found", err)
	return ""
}

func lastTagForRepository(path string) string {
	cmd := exec.Command("git", "-C", path, "describe", "--tags")
	stdout, err := cmd.Output()

	if err != nil {
		fmt.Println("[-]", err)
		return ""
	}
	return strings.Trim(string(stdout), "'\n")
}

func dockerImageLabel(image string, labelName string) (string, error) {
		regex, _ := regexp.Compile("[^a-zA-Z0-9-_]+")
		labelNameFiltered := regex.ReplaceAllString(labelName, "")

    cmd := exec.Command("docker", "inspect", "--format={{index .Config.Labels \""+labelNameFiltered+"\"}}", image)

    var out bytes.Buffer
    cmd.Stdout = &out

    err := cmd.Run()
    if err != nil {
        return "", err
    }

    labelValue := out.String()
    return labelValue, nil
}



func version(w http.ResponseWriter, r *http.Request) {
	plugin := r.URL.Query().Get("plugin")

	git_path := "/super/"

	if plugin != "" {
		git_path += "plugins/" + filepath.Clean(plugin)
	}

	version := versionForRepository(git_path)
	if version == "" {
		http.Error(w, "Failed to retrieve version "+plugin, 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(version)
}

func container_version(w http.ResponseWriter, r *http.Request) {
	//dockerImageLabel image, "org.supernetworks.version")
	plugin := r.URL.Query().Get("plugin")
	version := ""

	if plugin == "" {
		v, err := dockerImageLabel("superd", "org.supernetworks.version")
		if err != nil {
			http.Error(w, "Failed to retrieve version for superd", 400)
			return
		}
		version = strings.Trim(v, "\n")
	} else {
		v, err := dockerImageLabel(plugin, "org.supernetworks.version")
		if err != nil {
			http.Error(w, "Failed to retrieve version "+plugin, 400)
			return
		}
		version = strings.Trim(v, "\n")
	}

	if version == "" {
		http.Error(w, "Failed to retrieve version "+plugin, 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(version)
}


func establishConfigsIfEmpty(SuperDir string) {
	if _, err := os.Stat(SuperDir + "/configs/base/config.sh"); os.IsNotExist(err) {
		//
		_, err = exec.Command("cp", "-R", SuperDir+"/base/template_configs/.", SuperDir+"/configs").Output()
		if err != nil {
			fmt.Println("failed to copy", err)
			return
		}

		output, err := exec.Command(SuperDir + "/configs/scripts/gen_coredhcp_yaml.sh").Output()
		if err != nil {
			fmt.Println("failed to generate coredhcp configuration", err)
			return
		}

		err = ioutil.WriteFile(SuperDir+"/configs/dhcp/coredhcp.yml", output, 0600)
		if err != nil {
			fmt.Println("failed to write coredhcp.yml", err)
			return
		}

	}

}

func setup() {
	hostSuperDir := getHostSuperDir()

	if hostSuperDir == "" {
		fmt.Println("[-] Failed to locate super install")
		return
	}

	os.Setenv("SUPERDIR", hostSuperDir)

	establishConfigsIfEmpty("/super/")
}

func main() {
	err := os.Chdir("/super")
	if err != nil {
		fmt.Println("[-] Could not chdir to super directory")
		return
	}

	setup()

	os.MkdirAll(UNIX_PLUGIN_LISTENER, 0755)

	unix_plugin_router := mux.NewRouter().StrictSlash(true)
	unix_plugin_router.HandleFunc("/restart", restart).Methods("GET")
	unix_plugin_router.HandleFunc("/start", start).Methods("GET")
	unix_plugin_router.HandleFunc("/update", update).Methods("GET")
	unix_plugin_router.HandleFunc("/stop", stop).Methods("GET")

	unix_plugin_router.HandleFunc("/ghcr_auth", ghcr_auth).Methods("GET")
	unix_plugin_router.HandleFunc("/update_git", update_git).Methods("GET")

	unix_plugin_router.HandleFunc("/git_version", version).Methods("GET")
	unix_plugin_router.HandleFunc("/container_version", container_version).Methods("GET")

	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}
	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

	pluginServer.Serve(unixPluginListener)
}
