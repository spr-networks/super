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

import (
	"github.com/spr-networks/sprbus"
)

var UNIX_PLUGIN_LISTENER = "state/plugins/superd/socket"
var PlusAddons = "plugins/plus"
var UserAddons = "plugins/user"
var ComposeAllowListDefaults = []string{"docker-compose.yml", "docker-compose-test.yml", "docker-compose-virt.yml",
	"plugins/plus/pfw_extension/docker-compose.yml",
	"plugins/plus/mesh_extension/docker-compose.yml",
	"dyndns/docker-compose.yml",
	"ppp/docker-compose.yml",
	"wifid-setup/docker-compose.yml",
	"wifid-setup/docker-compose-test.yml",
	"wifi_uplink/docker-compose.yml"}

var ComposeAllowList = ComposeAllowListDefaults

var CUSTOM_ALLOW_PATH = "configs/base/custom_compose_paths.json"

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

func resetCustomVersion() {
	os.Remove(ReleaseVersionFile)
	os.Remove(ReleaseChannelFile)
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

	if channelFiltered == "main" {
		channelFiltered = ""
	}

	return os.WriteFile(ReleaseChannelFile, []byte(channelFiltered), 0644)
}

func isVirtual() bool {
	//when this is set, SPR is configured to run on
	// its own network namespace.
	return os.Getenv("VIRTUAL_SPR") != ""
}

func getDefaultCompose() string {
	envCompose := os.Getenv("COMPOSE_FILE")
	if envCompose != "" {
		return envCompose
	}

	if isVirtual() {
		return "docker-compose-virt.yml"
	}
	return "docker-compose.yml"
}

func composeCommand(composeFileIN string, target string, command string, optional string, new_docker bool) {
	args := []string{}
	release_channel := ""
	release_version := ""

	composeFile := composeFileIN

	if !strings.Contains(composeFile, "plugins") || isVirtual() {
		// important to get/set release channel and version for rollbacks and dev channels etc

		//we ignore these if its a plugin and were not in virtual mode.
		release_channel = getReleaseChannel()
		release_version = getReleaseVersion()
	}

	if release_channel != "" {
		os.Setenv("RELEASE_CHANNEL", release_channel)
	}

	if release_channel != "" {
		os.Setenv("RELEASE_VERSION", release_version)
	}

	defaultCompose := getDefaultCompose()
	if composeFile == "" {
		composeFile = defaultCompose
	}

	reloadComposeWhitelist()

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

	/*
		//upon testing this recreates service:base senselessly,
		// causing the services to lose their network. dont do this,
		// and take the restart hit for anything other than stop
	*/
	if command == "stop" && target == "" && isVirtual() {
		//define target for virtual to avoid total restart
		//TBD; need a tenable solution for this. perhaps parse compose file and pull
		//the first service.
		if composeFile == "plugins/plus/pfw_extension/docker-compose.yml" {
			target = "pfw"
		} else if composeFile == "plugins/plus/mesh_extension/docker-compose.yml" {
			target = "mesh"
		}

	}

	add_buildctx := ""
	if composeFileIN != "" && composeFile != getDefaultCompose() && isVirtual() {
		//we need to add the default in for virtual mode
		// so that it can pick up service:base

		//docker buildkit has introduced a bug with contexts, this is a workaround.
		add_buildctx = "BUILDCTX=" + filepath.Dir(composeFile)

		args = append(args, "-f", defaultCompose, "-f", composeFile, command)
	} else {
		args = append(args, "-f", composeFile, command)
	}

	if optional != "" {
		args = append(args, optional)
	}

	if target != "" {
		args = append(args, target)
	}

	cmd := "docker-compose"

	haveOldDC := true
	_, err := exec.LookPath("docker-compose")
	if err != nil {
		haveOldDC = false
	}

	if new_docker == true {
		//certain commands, like up -d, will run in a new docker container
		//so that superd updating itself does not result in docker killing
		// the up -d command.

		superdir := getHostSuperDir()

		cmd = "docker"
		d_args := append([]string{}, "run",
			"-v", superdir+":"+superdir,
			"-v", "/var/run/docker.sock:/var/run/docker.sock",
			"-w", superdir,
			"-e", "SUPERDIR="+superdir)

		if add_buildctx != "" {
			d_args = append(d_args, "-e", add_buildctx)
		}

		if release_channel != "" {
			d_args = append(d_args, "-e", "RELEASE_CHANNEL="+release_channel)
		}

		if release_version != "" {
			d_args = append(d_args, "-e", "RELEASE_VERSION="+release_version)
		}

		if isVirtual() {
			//need to propagate this variable
			d_args = append(d_args, "-e", "VIRTUAL_SPR="+os.Getenv("VIRTUAL_SPR"))
			//set network mode
			d_args = append(d_args, "-e", "NETWORK_MODE=service:base")
		}

		//docker.io, ever annoying, integrated compose as a subcommand.
		// so now we need to handle both cases

		if haveOldDC {
			args = append(d_args, "--entrypoint=/bin/bash",
				"ghcr.io/spr-networks/super_superd",
				"-c",
				"docker-compose "+strings.Join(args, " "))
		} else {
			args = append(d_args, "--entrypoint=/bin/bash",
				"ghcr.io/spr-networks/super_superd",
				"-c",
				"docker compose "+strings.Join(args, " "))
		}

	}

	if !new_docker && !haveOldDC {
		//need to run docker compose instead of docker-compose
		// if new_docker then this is already handled.
		// but if not new_docker and dont have old docker compose, this fixes it
		cmd = "docker"
		args = append([]string{"compose"}, args...)
	}

	_, err = exec.Command(cmd, args...).Output()
	if err != nil {
		argS := fmt.Sprintf(cmd + " " + strings.Join(args, " "))
		errString := err.Error() + " |" + argS
		fmt.Println("failure: " + errString)
		//tbd good place for a sprbus event
		sprbus.Publish("plugin:docker:failure", map[string]string{"Reason": "docker command failed", "Message": errString, "ComposeFile": composeFileIN})

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

func docker_ps(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")

	cmd := exec.Command("docker", "compose", "ps", "--format", "json", target)
	if compose != "" {

		composeAllowed := false
		for _, entry := range ComposeAllowList {
			if entry == compose {
				composeAllowed = true
				break
			}
		}

		if composeAllowed == false {
			http.Error(w, "Invalid compose file, failed", 400)
			return
		}

		cmd = exec.Command("docker", "compose", "-f", compose, "ps", "--format", "json", target)
	}

	out, err := cmd.Output()
	if err != nil {
		http.Error(w, "Command failed", 400)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(string(out))
}

func removeUserContainer(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")

	// if user plugin, remove container, image and dir
	dirName := filepath.Dir(compose)
	isUserPlugin := regexp.MustCompile(`^plugins/user/[A-Za-z0-9\-]+$`).MatchString
	if isUserPlugin(dirName) {
		go func() {
			fmt.Println("Removing container for user plugin:" + dirName)
			composeCommand(compose, target, "rm", "-fs", false)
		}()
	}
}

func userPluginExists(w http.ResponseWriter, r *http.Request) {
	git_url := r.URL.Query().Get("git_url")

	baseName := filepath.Base(git_url)
	pluginName := strings.TrimSuffix(baseName, ".git")
	dirName := filepath.Join("/super", "plugins", "user", pluginName)

	_, err := os.Stat(dirName)
	if err == nil {
		//200
		return
	} else {
		if os.IsNotExist(err) {
			http.Error(w, "Not found", 404)
			return
		}
	}

	//error
	http.Error(w, "Failed to check status "+err.Error(), 400)
	return
}

func build(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")
	opt := "--no-cache" // force rebuild
	go composeCommand(compose, target, "build", opt, false)
}

func restart(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")

	//run restart
	go composeCommand(compose, target, "restart", "", target == "")
}

func ghcr_auth(w http.ResponseWriter, r *http.Request) {

	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to retrieve credentials "+err.Error(), 400)
		return
	}

	creds := GitOptions{}

	if err := json.Unmarshal(body, &creds); err != nil {
		http.Error(w, "Failed to retrieve credentials "+err.Error(), 400)
		return
	}

	if creds.Secret != "" {
		var base64Regex = regexp.MustCompile(`^[a-zA-Z0-9+/=_]*$`)
		if !base64Regex.MatchString(creds.Secret) {
			// Handle invalid token
			http.Error(w, "Invalid token "+err.Error(), 400)
			return
		}
	}

	username := creds.Username
	secret := creds.Secret

	if username == "" || secret == "" {
		http.Error(w, "need username and secret parameters", 400)
		return
	}

	cmd := exec.Command("docker", "login", "containers.plus.supernetworks.org", "-u", username, "--password-stdin")
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

	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to retrieve credentials "+err.Error(), 400)
		return
	}

	creds := GitOptions{}

	if err := json.Unmarshal(body, &creds); err != nil {
		http.Error(w, "Failed to retrieve credentials "+err.Error(), 400)
		return
	}

	if creds.Secret != "" {
		var base64Regex = regexp.MustCompile(`^[a-zA-Z0-9+/=_]*$`)
		if !base64Regex.MatchString(creds.Secret) {
			// Handle invalid token
			http.Error(w, "Invalid token "+err.Error(), 400)
			return
		}

		git_url = "https://" + creds.Username + ":" + creds.Secret + "@" + git_url
	}

	if git_url == "" {
		os.Chdir("/super")
		//update SPR itself
		os.Setenv("GIT_TERMINAL_PROMPT", "0")
		out, _ := exec.Command("git", "pull").CombinedOutput()
		fmt.Println(string(out))
		return
	}
	os.Chdir("/super")

	repo := getRepoName(git_url)
	if repo == "" {
		http.Error(w, "Invalid git url "+git_url, 400)
		return
	}

	directory := PlusAddons
	if creds.Plus == false {
		directory = UserAddons
	}

	if _, err := os.Stat(directory); os.IsNotExist(err) {
		err := os.MkdirAll(directory, 0755)
		if err != nil {
			http.Error(w, "Could not create addons "+directory, 500)
			return
		}
	}

	err = os.Chdir(directory)
	if err != nil {
		http.Error(w, "Could not find addons directory", 500)
		os.Chdir("/super")
		return
	}

	os.Setenv("GIT_TERMINAL_PROMPT", "0")
	out, _ := exec.Command("git", "clone", "--recurse-submodule", git_url).CombinedOutput()
	fmt.Println(string(out))

	if strings.Contains(string(out), "fatal") {
		if !strings.Contains(string(out), "already exists") {
			http.Error(w, "Could not clone repository", 400)
			os.Chdir("/super")
			return
		}
	}

	err = os.Chdir(repo)

	if err != nil {
		http.Error(w, "Could not cd to repository", 400)
		os.Chdir("/super")
		return
	}

	out, _ = exec.Command("git", "pull").CombinedOutput()
	fmt.Println(string(out))

	if creds.Plus == false && creds.AutoConfig == true {
		data, err := configureUserPlugin(repo)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if len(data) == 0 {
			http.Error(w, "Empty plugin configuration", 400)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)
	}

	os.Chdir("/super")

}

func getRepoName(gitURL string) string {
	trimmedURL := strings.TrimSuffix(gitURL, ".git")
	repoName := filepath.Base(trimmedURL)
	if strings.Contains(repoName, "..") {
		return ""
	}
	return repoName
}

func configureUserPlugin(repoName string) ([]byte, error) {
	pluginConfigPath := filepath.Join("/super", "plugins", "user", repoName, "plugin.json")
	if _, err := os.Stat(pluginConfigPath); os.IsNotExist(err) {
		return []byte{}, fmt.Errorf("Could not find user plugin config " + pluginConfigPath)
	}

	data, err := os.ReadFile(pluginConfigPath)

	return data, err
}

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("DEBUGHTTP") != "" {
			fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		}
		handler.ServeHTTP(w, r)
	})
}

func getHostSuperDir() string {
	default_dir := "/home/spr/super/"
	f := "'{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}'"

	cmd := exec.Command("docker", "inspect", "--format="+f, "superd")
	stdout, err := cmd.Output()

	if err != nil {
		fmt.Println("[-]", err)
		return default_dir
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
		//in case the container has not been created use the full image name
		spr_prefix := "ghcr.io/spr-networks/super_"
		image_name := strings.Replace(image, "super", "", 1)
		image_name = strings.ReplaceAll(image_name, "-", "_")
		cmd = exec.Command("docker", "inspect", "--format={{index .Config.Labels \""+labelName+"\"}}", spr_prefix+image_name)

		var out bytes.Buffer
		cmd.Stdout = &out

		err := cmd.Run()
		if err != nil {
			return "", err
		}
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

	if r.Method == http.MethodDelete {
		resetCustomVersion()
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
		//right now we only allow "-dev" and "main"
		if info.CustomChannel != "-dev" && info.CustomChannel != "main" {
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
	json.NewEncoder(w).Encode(info)
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

type GitOptions struct {
	Username   string
	Secret     string
	Plus       bool
	AutoConfig bool
}

func remote_container_tags(w http.ResponseWriter, r *http.Request) {

	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to retrieve credentials "+err.Error(), 400)
		return
	}

	creds := GitOptions{}

	if err := json.Unmarshal(body, &creds); err != nil {
		http.Error(w, "Failed to retrieve credentials "+err.Error(), 400)
		return
	}

	if creds.Secret != "" {
		var base64Regex = regexp.MustCompile(`^[a-zA-Z0-9+/=_]*$`)
		if !base64Regex.MatchString(creds.Secret) {
			// Handle invalid token
			http.Error(w, "Invalid token "+err.Error(), 400)
			return
		}
	}

	username := creds.Username
	secret := creds.Secret
	container := url.QueryEscape(r.URL.Query().Get("container"))
	host := "ghcr.io"

	if creds.Plus && secret != "" {
		host = "containers.plus.supernetworks.org"
	}

	params := url.Values{}
	params.Set("service", "ghcr.io")
	params.Set("scope", "repository:spr-networks/"+container+":pull")

	append := "?" + params.Encode()

	// Set up the request to get the token
	req, err := http.NewRequest("GET", "https://"+host+"/token"+append, nil)
	if err != nil {
		http.Error(w, "Failed to retrieve tags "+err.Error(), 400)
		return
	}

	if username != "" && secret != "" {
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
	tagsURL := "https://" + host + "/v2/spr-networks/" + container + "/tags/list?n=99999999999"
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

func compose_paths(w http.ResponseWriter, r *http.Request) {
	//NOTE: DO NOT add modification here. A user should have to
	// be using console access to add paths, since docker containers
	// represent privilege escalation
	// That should not happen from the UI alone.
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ComposeAllowList)
}

func reloadComposeWhitelist() {
	//augment ComposeAllowList

	data, err := ioutil.ReadFile(CUSTOM_ALLOW_PATH)
	if err == nil {
		newAllow := []string{}
		err = json.Unmarshal(data, &newAllow)
		if err != nil {
			fmt.Println("Failed to load custom compose json", err)
		} else {
			ComposeAllowList = append(ComposeAllowListDefaults, newAllow...)
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

	reloadComposeWhitelist()

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
	unix_plugin_router.HandleFunc("/stop", stop).Methods("PUT")
	unix_plugin_router.HandleFunc("/update", update).Methods("PUT")
	unix_plugin_router.HandleFunc("/remove", removeUserContainer).Methods("PUT")
	unix_plugin_router.HandleFunc("/build", build).Methods("PUT")
	unix_plugin_router.HandleFunc("/user_plugin_exists", userPluginExists).Methods("GET")

	unix_plugin_router.HandleFunc("/ghcr_auth", ghcr_auth).Methods("PUT")
	unix_plugin_router.HandleFunc("/update_git", update_git).Methods("PUT")

	unix_plugin_router.HandleFunc("/git_version", version).Methods("GET")
	unix_plugin_router.HandleFunc("/container_version", container_version).Methods("GET")

	unix_plugin_router.HandleFunc("/remote_container_tags", remote_container_tags).Methods("POST")

	unix_plugin_router.HandleFunc("/docker_ps", docker_ps).Methods("GET")

	// get/set release channel
	unix_plugin_router.HandleFunc("/release", release_info).Methods("GET", "PUT", "DELETE")

	unix_plugin_router.HandleFunc("/compose_paths", compose_paths).Methods("GET")

	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}
	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

	pluginServer.Serve(unixPluginListener)
}
