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
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

import (
	"github.com/gorilla/mux"
)

var UNIX_PLUGIN_LISTENER = "state/plugins/superd/socket"
var PlusAddons = "plugins/plus"
var ComposeAllowList = []string{"docker-compose.yml", "docker-compose-test.yml", "docker-compose-virt.yml", "plugins/plus/pfw_extension/docker-compose.yml", "plugins/plus/mesh_extension/docker-compose.yml"}
var ReleaseChannelFile = "configs/base/release_channel"
var ReleaseVersionFile = "configs/base/release_version"

var ReleaseInfoMtx sync.Mutex

func getReleaseVersion() string {
	ReleaseInfoMtx.Lock()
	defer ReleaseInfoMtx.Unlock()

	data, err := os.ReadFile(ReleaseVersionFile)
	if err == nil {
		return strings.TrimSpace(string(data))
	} else {
		return ""
	}
}

func setReleaseVersion(Version string) error {
	ReleaseInfoMtx.Lock()
	defer ReleaseInfoMtx.Unlock()

	regex, _ := regexp.Compile("[^a-zA-Z0-9-_.]+")
	versionFiltered := regex.ReplaceAllString(Version, "")
	return os.WriteFile(ReleaseVersionFile, []byte(versionFiltered), 0644)
}

func getReleaseChannel() string {
	ReleaseInfoMtx.Lock()
	defer ReleaseInfoMtx.Unlock()

	data, err := os.ReadFile(ReleaseChannelFile)
	if err == nil {
		return strings.TrimSpace(string(data))
	} else {
		return ""
	}
}

func setReleaseChannel(Channel string) error {
	ReleaseInfoMtx.Lock()
	defer ReleaseInfoMtx.Unlock()

	regex, _ := regexp.Compile("[^a-zA-Z0-9-_]+")
	channelFiltered := regex.ReplaceAllString(Channel, "")
	return os.WriteFile(ReleaseChannelFile, []byte(channelFiltered), 0644)
}

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

func composeCommand(composeFile string, target string, command string, optional string, new_docker bool) {
	args := []string{}
	release_channel := ""
	release_version := ""

	if !strings.Contains(composeFile, "plugins") {
		// important to get/set release channel and version for rollbacks and dev channels etc
		release_channel = getReleaseChannel()
		release_version = getReleaseVersion()
	}

	if release_channel != "" {
		os.Setenv("RELEASE_CHANNEL", release_channel)
	}

	if release_channel != "" {
		os.Setenv("RELEASE_VERSION", release_version)
	}

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

	args = append(args, "-f", composeFile, command)

	if optional != "" {
		args = append(args, optional)
	}

	if target != "" {
		args = append(args, target)
	}

	cmd := "docker-compose"
	if new_docker == true {
		//certain commands, like up -d, will run in a new docker container
		//so that superd updating itself does not result in docker killing
		// the up -d command.

		superdir := getHostSuperDir()

		cmd = "docker"
		d_args := append([]string{}, "run",
			"-v", superdir+":/super",
			"-v", "/var/run/docker.sock:/var/run/docker.sock",
			"-w", "/super/",
			"-e", "SUPERDIR="+superdir)

		if release_channel != "" {
			d_args = append(d_args, "-e", "RELEASE_CHANNEL="+release_channel)
		}

		if release_version != "" {
			d_args = append(d_args, "-e", "RELEASE_VERSION="+release_version)
		}

		args = append(d_args, "--entrypoint=/bin/bash",
			"ghcr.io/spr-networks/super_superd",
			"-c",
			"docker-compose "+strings.Join(args, " "))
	}

	_, err := exec.Command(cmd, args...).Output()
	if err != nil {
		argS := fmt.Sprintf(cmd + " " + strings.Join(args, " "))
		fmt.Println("failure: " + err.Error() + " |" + argS)
	}

}

func update(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")
	composeCommand(compose, target, "pull", "", false)
}

func start(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")
	composeCommand(compose, target, "up", "-d", true)
}

func stop(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")
	go composeCommand(compose, target, "stop", "", false)
}

func restart(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")

	//run restart
	go composeCommand(compose, target, "restart", "", false)
}

func ghcr_auth(w http.ResponseWriter, r *http.Request) {

	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to retrieve credentials "+err.Error(), 400)
		return
	}

	creds := GhcrCreds{}

	if err := json.Unmarshal(body, &creds); err != nil {
		http.Error(w, "Failed to retrieve credentials "+err.Error(), 400)
		return
	}

	username := creds.Username
	secret := creds.Secret

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
	cmd := exec.Command("docker", "inspect", "--format={{index .Config.Labels \""+labelName+"\"}}", image)

	var out bytes.Buffer
	cmd.Stdout = &out

	err := cmd.Run()
	if err != nil {
		return "", err
	}

	labelValue := strings.Trim(out.String(), "\n")
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
	container := r.URL.Query().Get("container")
	image := "superd"
	if container != "" {
		image = container
	}

	version, err := dockerImageLabel(image, "org.supernetworks.version")
	if err != nil {
		http.Error(w, "Failed to retrieve version "+image, 400)
		return
	}

	if version == "" {
		http.Error(w, "Failed to retrieve version "+image, 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(version)
}

type ReleaseInfo struct {
	CustomChannel string
	CustomVersion string
	Current       string
}

func release_info(w http.ResponseWriter, r *http.Request) {

	info := ReleaseInfo{}
	if r.Method == http.MethodGet {
		//load t
		v, err := dockerImageLabel("superd", "org.supernetworks.version")
		if err != nil {
			fmt.Println("[i] Failed to retrieve version for superd")
		} else {
			info.Current = v
		}

		info.CustomChannel = getReleaseChannel()
		info.CustomVersion = getReleaseVersion()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(info)
		return
	}

	//PUT. Set these
	err := json.NewDecoder(r.Body).Decode(&info)
	if err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	if info.CustomChannel != "" {
		//right now we only allow "-dev"
		if info.CustomChannel != "-dev" {
			http.Error(w, "Unsupported channel "+info.CustomChannel, 400)
			return
		}

		// in case more channels are allowed in the future
		regex, _ := regexp.Compile("[^a-zA-Z0-9-_]+")
		channelFiltered := regex.ReplaceAllString(info.CustomChannel, "")
		if channelFiltered != info.CustomChannel {
			http.Error(w, "Channel includes unexpected characters", 400)
			return
		}

		setReleaseChannel(info.CustomChannel)
	}

	if info.CustomVersion != "" {
		regex, _ := regexp.Compile("[^a-zA-Z0-9-_.]+")
		versionFiltered := regex.ReplaceAllString(info.CustomVersion, "")

		if versionFiltered != info.CustomVersion {
			http.Error(w, "Version includes unexpected characters", 400)
			return
		}

		setReleaseVersion(info.CustomVersion)
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


type GhcrCreds struct {
	Username string
	Secret string
}


func remote_container_tags(w http.ResponseWriter, r *http.Request) {

	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to retrieve credentials "+err.Error(), 400)
		return
	}

	creds := GhcrCreds{}

	if err := json.Unmarshal(body, &creds); err != nil {
		http.Error(w, "Failed to retrieve credentials "+err.Error(), 400)
		return
	}

	username := creds.Username
	secret := creds.Secret
	container := url.QueryEscape(r.URL.Query().Get("container"))

	params := url.Values{}
	params.Set("service", "ghcr.io")
	params.Set("scope", "repository:spr-networks/"+container+":pull")

	append := "?" + params.Encode()

	// Set up the request to get the token
	req, err := http.NewRequest("GET", "https://ghcr.io/token"+append, nil)
	if err != nil {
		http.Error(w, "Failed to retrieve tags "+err.Error(), 400)
		return
	}

	if username != "" {
		auth := base64.StdEncoding.EncodeToString([]byte(username + ":" + secret))
		req.Header.Set("Authorization", "Basic "+auth)
	}

	client := &http.Client{
		Timeout: time.Second * 10,
	}

	// Send the request and get the response
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "Failed to retrieve tags "+err.Error(), 400)
		return
	}
	defer resp.Body.Close()

	// Parse the response body to get the token
	var token struct {
		Token string `json:"token"`
	}
	body, err = ioutil.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "Failed to retrieve tags "+err.Error(), 400)
		return
	}
	if err := json.Unmarshal(body, &token); err != nil {
		http.Error(w, "Failed to retrieve tags "+err.Error(), 400)
		return
	}

	// Sanitize the token to ensure it is a valid base64-encoded string
	token.Token = strings.TrimSpace(token.Token)
	_, err = base64.StdEncoding.DecodeString(token.Token)
	if err != nil {
		http.Error(w, "Failed to retrieve tags "+err.Error(), 400)
		return
	}

	// Set up the request to get the list of tags
	tagsURL := "https://ghcr.io/v2/spr-networks/" + container + "/tags/list"
	req, err = http.NewRequest("GET", tagsURL, nil)
	if err != nil {
		http.Error(w, "Failed to retrieve tags "+err.Error(), 400)
		return
	}

	// Add the Authorization header with the token
	req.Header.Set("Authorization", "Bearer "+token.Token)

	// Send the request and get the response
	resp, err = client.Do(req)
	if err != nil {
		http.Error(w, "Failed to retrieve tags "+err.Error(), 400)
		return
	}
	defer resp.Body.Close()

	// Print the response body
	body, err = ioutil.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "Failed to retrieve tags "+err.Error(), 400)
		return
	}

	// Parse the response body to get the list of tags
	var tagsResp struct {
		Tags []string `json:"tags"`
	}
	if err := json.Unmarshal(body, &tagsResp); err != nil {
		http.Error(w, "Failed to retrieve tags "+err.Error(), 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tagsResp)
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
	unix_plugin_router.HandleFunc("/restart", restart).Methods("PUT")
	unix_plugin_router.HandleFunc("/start", start).Methods("PUT")
	unix_plugin_router.HandleFunc("/update", update).Methods("PUT")
	unix_plugin_router.HandleFunc("/stop", stop).Methods("PUT")

	unix_plugin_router.HandleFunc("/ghcr_auth", ghcr_auth).Methods("PUT")
	unix_plugin_router.HandleFunc("/update_git", update_git).Methods("PUT")

	unix_plugin_router.HandleFunc("/git_version", version).Methods("GET")
	unix_plugin_router.HandleFunc("/container_version", container_version).Methods("GET")

	unix_plugin_router.HandleFunc("/remote_container_tags", remote_container_tags).Methods("POST")

	// get/set release channel
	unix_plugin_router.HandleFunc("/release", release_info).Methods("GET", "PUT")

	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}
	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

	pluginServer.Serve(unixPluginListener)
}
