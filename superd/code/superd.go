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
	"encoding/base64"
	"encoding/json"
	"errors"
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
	"sort"
	"strings"
	"sync"
	"time"
)

import (
	"github.com/gorilla/mux"
	yaml "go.yaml.in/yaml/v3"
)

import (
	sprbus "github.com/spr-networks/sprbus-json"
)

var UNIX_PLUGIN_LISTENER = "state/plugins/superd/socket"
var DockerSocketPath = "/var/run/docker.sock"
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
var composeCommandMtx sync.Mutex

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

// service names declared in a plugin compose file, for targeting
// stop/down in virtual mode where plugins run in the merged project
func pluginComposeServices(composeFile string) []string {
	data, err := os.ReadFile(composeFile)
	if err != nil {
		fmt.Println("failed to read compose file", composeFile, err)
		return nil
	}

	doc := struct {
		Services map[string]interface{} `yaml:"services"`
	}{}

	if err := yaml.Unmarshal(data, &doc); err != nil {
		fmt.Println("failed to parse compose file", composeFile, err)
		return nil
	}

	names := []string{}
	for name := range doc.Services {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

var networkBridgeConflictRe = regexp.MustCompile(`conflicts with network ([0-9a-f]{64}) \(([^)]+)\): networks have same bridge name`)

func parseNetworkBridgeConflict(detail string) (id string, name string, ok bool) {
	m := networkBridgeConflictRe.FindStringSubmatch(detail)
	if m == nil {
		return "", "", false
	}
	return m[1], m[2], true
}

func remediateNetworkBridgeConflict(detail string, removed map[string]bool) bool {
	id, name, ok := parseNetworkBridgeConflict(detail)
	if !ok || removed[id] {
		return false
	}
	removed[id] = true
	out, err := exec.Command("docker", "network", "rm", id).CombinedOutput()
	if err != nil {
		fmt.Println("failed to remove conflicting network " + name + " (" + id + "): " + strings.TrimSpace(string(out)))
		return false
	}
	fmt.Println("removed stale network " + name + " (" + id + ") with conflicting bridge name, retrying")
	sprbus.Publish("plugin:docker:remediation", map[string]string{
		"Reason":  "removed stale network with conflicting bridge name",
		"Network": name,
		"ID":      id,
	})
	return true
}

func composeCommand(composeFileIN string, target string, command string, optional string, new_docker bool) error {
	composeCommandMtx.Lock()
	defer composeCommandMtx.Unlock()

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
		return fmt.Errorf("compose file path is not whitelisted: %s", composeFile)
	}

	/*
		//upon testing this recreates service:base senselessly,
		// causing the services to lose their network. dont do this,
		// and take the restart hit for anything other than stop
	*/
	if (command == "stop" || command == "down" || command == "restart" || command == "up") &&
		target == "" && isVirtual() {
		//in virtual mode plugin commands run against the merged compose
		//project: without a service target, stop/down would take the whole
		//stack with them. target only the plugin's own services.
		if composeFile == "plugins/plus/pfw_extension/docker-compose.yml" {
			target = "pfw"
		} else if composeFile == "plugins/plus/mesh_extension/docker-compose.yml" {
			target = "mesh"
		} else if composeFile != defaultCompose {
			target = strings.Join(pluginComposeServices(composeFile), " ")
		}
	}

	if isVirtual() && command == "down" && target == "" && composeFile != defaultCompose {
		//never run an untargeted down against the merged project
		return fmt.Errorf("refusing untargeted down of %s in virtual mode", composeFile)
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
		args = append(args, strings.Fields(target)...)
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

	var output []byte
	removedNetworks := map[string]bool{}
	for attempt := 0; ; attempt++ {
		output, err = exec.Command(cmd, args...).CombinedOutput()
		if err == nil {
			return nil
		}
		if command == "up" && attempt < 4 &&
			remediateNetworkBridgeConflict(string(output), removedNetworks) {
			continue
		}
		break
	}

	argS := strings.Join(append([]string{cmd}, args...), " ")
	errString := err.Error()
	if detail := strings.TrimSpace(string(output)); detail != "" {
		errString += ": " + detail
	}
	errString += " |" + argS
	fmt.Println("failure: " + errString)
	//tbd good place for a sprbus event
	sprbus.Publish("plugin:docker:failure", map[string]string{"Reason": "docker command failed", "Message": errString, "ComposeFile": composeFileIN})
	return errors.New(errString)
}

func update(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")

	//on the main release channel, verify build provenance for the images this
	//update would pull. on failure abort before downloading anything.
	verified := map[string]string{}
	if getReleaseChannel() == "" {
		v, err := verifyUpdateImages(compose, target)
		if err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		verified = v
	}

	composeCommand(compose, target, "pull", "", false)

	if getReleaseChannel() == "" {
		err := verifyPulledUpdate(compose, target, verified)
		if err != nil {
			http.Error(w, err.Error(), 500)
			return
		}
		go verifyPulledImages(false)
	}
}

func start(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")
	if err := composeCommand(compose, target, "up", "-d", true); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func stop(w http.ResponseWriter, r *http.Request) {
	target := r.URL.Query().Get("service")
	compose := r.URL.Query().Get("compose_file")
	go composeCommand(compose, target, "stop", "", false)
}

var composeVarPattern = regexp.MustCompile(`\$\{([A-Za-z_][A-Za-z0-9_]*)(:-([^}]*))?\}`)

func expandComposeVar(s string) string {
	return composeVarPattern.ReplaceAllStringFunc(s, func(m string) string {
		parts := composeVarPattern.FindStringSubmatch(m)
		val := os.Getenv(parts[1])
		if val == "" {
			val = parts[3]
		}
		return val
	})
}

func pluginComposeImages(composeFile string) []string {
	reloadComposeWhitelist()

	composeAllowed := false
	for _, entry := range ComposeAllowList {
		if entry == composeFile {
			composeAllowed = true
			break
		}
	}

	if composeAllowed == false {
		fmt.Println("Compose file path is not whitelisted", composeFile)
		return nil
	}

	data, err := os.ReadFile(composeFile)
	if err != nil {
		return nil
	}

	doc := struct {
		Services map[string]struct {
			Image string `yaml:"image"`
		} `yaml:"services"`
	}{}

	if yaml.Unmarshal(data, &doc) != nil {
		return nil
	}

	images := []string{}
	for _, svc := range doc.Services {
		if svc.Image != "" {
			images = append(images, expandComposeVar(svc.Image))
		}
	}
	sort.Strings(images)
	return images
}

func imageIDs(tags []string) map[string]string {
	ids := map[string]string{}
	for _, tag := range tags {
		out, err := exec.Command("docker", "image", "inspect", "-f", "{{.Id}}", tag).Output()
		if err == nil {
			ids[tag] = strings.TrimSpace(string(out))
		} else {
			ids[tag] = ""
		}
	}
	return ids
}

// pull a plugin's images; if any changed, cycle the plugin with down + up
func updateContainer(w http.ResponseWriter, r *http.Request) {
	compose := r.URL.Query().Get("compose_file")
	if compose == "" {
		http.Error(w, "compose_file required", 400)
		return
	}

	images := pluginComposeImages(compose)
	if len(images) == 0 {
		http.Error(w, "no images found in compose file", 400)
		return
	}

	before := imageIDs(images)

	if err := composeCommand(compose, "", "pull", "", false); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}

	updated := r.URL.Query().Get("force") == "1"
	for tag, id := range imageIDs(images) {
		if id != before[tag] {
			updated = true
			break
		}
	}

	if updated {
		if err := composeCommand(compose, "", "down", "", false); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if err := composeCommand(compose, "", "up", "-d", true); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"Updated": updated})
}

// remove a plugin's containers and networks (docker compose down)
func down(w http.ResponseWriter, r *http.Request) {
	compose := r.URL.Query().Get("compose_file")
	if compose == "" {
		//never run a bare down against the default compose
		http.Error(w, "compose_file required", 400)
		return
	}

	go composeCommand(compose, "", "down", "", false)
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

func docker_info(w http.ResponseWriter, r *http.Request) {
	path, err := dockerInfoPath(r.URL.Query().Get("resource"), r.URL.Query().Get("id"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	data, err := dockerAPIGet(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func dockerInfoPath(resource, id string) (string, error) {
	switch resource {
	case "containers":
		if id != "" {
			return "", errors.New("container id is not supported")
		}
		return "/containers/json?all=1", nil
	case "networks":
		if id != "" {
			return "/networks/" + url.PathEscape(id), nil
		}
		return "/networks", nil
	default:
		return "", errors.New("unsupported Docker info resource")
	}
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
	go func() {
		err := composeCommand(compose, target, "restart", "", target == "")
		if err != nil {
			fmt.Println("restart failed, falling back to up -d for " + compose)
			composeCommand(compose, target, "up", "-d", true)
		}
	}()
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

	gitChanged := !strings.Contains(strings.ToLower(string(out)), "up to date")

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
		os.Chdir("/super")
		return
	}

	os.Chdir("/super")

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"Changed": gitChanged})
}

func getRepoName(gitURL string) string {
	trimmedURL := strings.TrimSuffix(gitURL, ".git")
	repoName := filepath.Base(trimmedURL)
	if strings.Contains(repoName, "..") {
		return ""
	}
	return repoName
}

const (
	pluginRuntimeDefault = "default"
	pluginRuntimeKVM     = "kvm"
)

func normalizePluginRuntime(runtime string) (string, error) {
	runtime = strings.ToLower(strings.TrimSpace(runtime))
	if runtime == "" {
		return pluginRuntimeDefault, nil
	}
	switch runtime {
	case pluginRuntimeDefault, pluginRuntimeKVM:
		return runtime, nil
	default:
		return "", fmt.Errorf("unsupported plugin runtime %q", runtime)
	}
}

func configureUserPlugin(repoName string) ([]byte, error) {
	if repoName == "" || filepath.Base(repoName) != repoName || repoName == "." {
		return []byte{}, fmt.Errorf("invalid user plugin repository name %q", repoName)
	}

	pluginRelativeDir := filepath.Join("plugins", "user", repoName)
	pluginConfigPath := filepath.Join("/super", pluginRelativeDir, "plugin.json")
	if _, err := os.Stat(pluginConfigPath); os.IsNotExist(err) {
		return []byte{}, fmt.Errorf("could not find user plugin config %s", pluginConfigPath)
	}

	data, err := os.ReadFile(pluginConfigPath)
	if err != nil {
		return nil, err
	}

	var manifest struct {
		Runtime string
	}
	if err := json.Unmarshal(data, &manifest); err != nil {
		return nil, fmt.Errorf("invalid user plugin config %s: %w", pluginConfigPath, err)
	}

	runtime, err := normalizePluginRuntime(manifest.Runtime)
	if err != nil {
		return nil, fmt.Errorf("invalid user plugin config %s: %w", pluginConfigPath, err)
	}
	composeName := "docker-compose.yml"
	if runtime == pluginRuntimeKVM {
		composeName = "docker-compose-kvm.yml"
	}
	composeRelativePath := filepath.Join(pluginRelativeDir, composeName)
	composePath := filepath.Join("/super", composeRelativePath)
	info, err := os.Stat(composePath)
	if err != nil {
		return nil, fmt.Errorf("could not find user plugin compose file %s: %w", composePath, err)
	}
	if !info.Mode().IsRegular() {
		return nil, fmt.Errorf("user plugin compose file is not regular: %s", composePath)
	}

	var config map[string]interface{}
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, fmt.Errorf("invalid user plugin config %s: %w", pluginConfigPath, err)
	}
	config["Runtime"] = runtime
	config["ComposeFilePath"] = filepath.ToSlash(composeRelativePath)
	return json.Marshal(config)
}

func getUserPluginConfig(w http.ResponseWriter, r *http.Request) {
	repoName := getRepoName(r.URL.Query().Get("git_url"))
	if repoName == "" {
		http.Error(w, "invalid user plugin git URL", http.StatusBadRequest)
		return
	}
	data, err := configureUserPlugin(repoName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func logRequest(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("DEBUGHTTP") != "" {
			fmt.Printf("%s %s %s\n", r.RemoteAddr, r.Method, r.URL)
		}
		handler.ServeHTTP(w, r)
	})
}

func dockerAPIGet(path string) ([]byte, error) {
	c := http.Client{
		Timeout: 10 * time.Second,
		Transport: &http.Transport{
			Dial: func(network, addr string) (net.Conn, error) {
				return net.Dial("unix", DockerSocketPath)
			},
		},
	}
	defer c.CloseIdleConnections()

	resp, err := c.Get("http://localhost" + path)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("docker api %s: status %d: %s", path, resp.StatusCode, strings.TrimSpace(string(data)))
	}

	return data, nil
}

func dockerAPIGetJSON(path string, target interface{}) error {
	data, err := dockerAPIGet(path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, target)
}

type dockerConfigLabels struct {
	Config struct {
		Labels map[string]string
	}
}

// dockerObjectLabel returns a label value from a container or image,
// matching `docker inspect` lookup order: container name first, then image.
// A missing label on an existing object returns "" without error, like
// `docker inspect --format={{index .Config.Labels "name"}}`.
func dockerObjectLabel(name, labelName string) (string, error) {
	info := dockerConfigLabels{}

	err := dockerAPIGetJSON("/containers/"+url.PathEscape(name)+"/json", &info)
	if err != nil {
		err = dockerAPIGetJSON("/images/"+url.PathEscape(name)+"/json", &info)
		if err != nil {
			return "", err
		}
	}

	return info.Config.Labels[labelName], nil
}

func getHostSuperDir() string {
	default_dir := "/home/spr/super/"

	value, err := dockerObjectLabel("superd", "com.docker.compose.project.working_dir")
	if err != nil {
		fmt.Println("[-]", err)
		return default_dir
	}

	return value + "/"
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

func dockerImageCandidates(image string) []string {
	candidates := []string{image}

	// Core services historically use container names such as "superapi" and
	// registry images such as "super_api". Keep that lookup for compatibility.
	if strings.HasPrefix(image, "super") {
		imageName := strings.TrimPrefix(image, "super")
		imageName = strings.ReplaceAll(imageName, "-", "_")
		candidates = append(candidates, "ghcr.io/spr-networks/super_"+imageName)
	}

	// User plugins use spr-* container and image names. Older frontends prepend
	// "super" to every plugin name, so accept both "spr-foo" and
	// "superspr-foo" while preferring the running container over :latest.
	pluginName := image
	if strings.HasPrefix(image, "superspr-") {
		pluginName = strings.TrimPrefix(image, "super")
		candidates = append(candidates, pluginName)
	}
	if strings.HasPrefix(pluginName, "spr-") {
		candidates = append(candidates, "ghcr.io/spr-networks/"+pluginName+":latest")
	}

	return candidates
}

func dockerImageLabel(image string, labelName string) (string, error) {
	var lastErr error
	for _, candidate := range dockerImageCandidates(image) {
		labelValue, err := dockerObjectLabel(candidate, labelName)
		if err == nil {
			return labelValue, nil
		}
		lastErr = err
	}

	return "", lastErr
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

	query := "?" + params.Encode()

	// Set up the request to get the token
	req, err := http.NewRequest("GET", "https://"+host+"/token"+query, nil)
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

	// Fetch the list of tags. The registry caps each page (ghcr: 1000 tags)
	// and paginates via the Link header, so follow rel="next" until done.
	var tagsResp struct {
		Tags []string `json:"tags"`
	}

	tagsURL := "https://" + host + "/v2/spr-networks/" + container + "/tags/list?n=1000"
	for page := 0; page < 100 && tagsURL != ""; page++ {
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

		body, err = ioutil.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			http.Error(w, "Failed to retrieve tags "+err.Error(), 400)
			return
		}

		var pageResp struct {
			Tags []string `json:"tags"`
		}
		if err := json.Unmarshal(body, &pageResp); err != nil {
			http.Error(w, "Failed to retrieve tags "+err.Error(), 400)
			return
		}
		tagsResp.Tags = append(tagsResp.Tags, pageResp.Tags...)

		tagsURL = nextTagsPageURL(host, resp.Header.Get("Link"))
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tagsResp)
}

// parse an RFC 5988 Link header for rel="next" and resolve it against host.
// registries return a path reference like </v2/...?last=x&n=1000>; rel="next"
func nextTagsPageURL(host string, linkHeader string) string {
	if linkHeader == "" {
		return ""
	}
	for _, entry := range strings.Split(linkHeader, ",") {
		if !strings.Contains(entry, `rel="next"`) {
			continue
		}
		start := strings.Index(entry, "<")
		end := strings.Index(entry, ">")
		if start == -1 || end == -1 || end <= start+1 {
			return ""
		}
		ref := entry[start+1 : end]
		if strings.HasPrefix(ref, "https://") || strings.HasPrefix(ref, "http://") {
			return ref
		}
		if !strings.HasPrefix(ref, "/") {
			ref = "/" + ref
		}
		return "https://" + host + ref
	}
	return ""
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

var sshKeyRe = regexp.MustCompile(`^[A-Za-z0-9.@_-]+ [A-Za-z0-9+/]+=*( [\x20-\x7E]*)?$`)

const tplImage = "ghcr.io/spr-networks/container_template:latest"
const authorizedKeysScript = "/home/spr/super/superd/scripts/install-authorized-keys.sh"

func deployAuthorizedKeys(w http.ResponseWriter, r *http.Request) {
	var keys []string
	if json.NewDecoder(r.Body).Decode(&keys) != nil || len(keys) == 0 {
		http.Error(w, "no keys", 400)
		return
	}
	for i, k := range keys {
		k = strings.TrimSpace(k)
		if strings.ContainsAny(k, "\r\n\x00") || !sshKeyRe.MatchString(k) {
			http.Error(w, "invalid key", 400)
			return
		}
		keys[i] = k
	}
	cmd := exec.Command("docker", "run", "--rm", "-i",
		"-v", "/home/ubuntu/.ssh:/host_ssh",
		"-v", authorizedKeysScript+":/install.sh:ro",
		tplImage, "/install.sh")
	cmd.Stdin = strings.NewReader(strings.Join(keys, "\n") + "\n")
	out, err := cmd.CombinedOutput()
	if e, ok := err.(*exec.ExitError); ok && e.ExitCode() == 3 {
		http.Error(w, strings.TrimSpace(string(out)), http.StatusConflict)
		return
	}
	if err != nil {
		http.Error(w, strings.TrimSpace(string(out)), 500)
	}
}

func getAuthorizedKeys(w http.ResponseWriter, r *http.Request) {
	out, err := exec.Command("docker", "run", "--rm",
		"-v", "/home/ubuntu/.ssh:/host_ssh:ro",
		tplImage, "cat", "/host_ssh/authorized_keys").Output()
	keys := []string{}
	for _, line := range strings.Split(string(out), "\n") {
		if line = strings.TrimSpace(line); line != "" && !strings.HasPrefix(line, "#") {
			keys = append(keys, line)
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"Locked": err == nil, "Keys": keys})
}

// Force systemd-timesyncd to re-poll NTP. Runs in a privileged container
// with --pid=host so nsenter can pivot into the host's namespaces.
func syncTime(w http.ResponseWriter, r *http.Request) {
	out, err := exec.Command("docker", "run", "--rm", "--privileged", "--pid=host",
		tplImage, "nsenter", "-t", "1", "-m", "-u", "-n", "-i", "-p",
		"systemctl", "restart", "systemd-timesyncd").CombinedOutput()
	if err != nil {
		http.Error(w, strings.TrimSpace(string(out)), 500)
		return
	}
	w.WriteHeader(http.StatusOK)
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
	unix_plugin_router.HandleFunc("/attest_status", attestStatus).Methods("GET", "PUT")
	unix_plugin_router.HandleFunc("/plugin_attest", pluginAttest).Methods("GET")
	unix_plugin_router.HandleFunc("/start", start).Methods("PUT")
	unix_plugin_router.HandleFunc("/stop", stop).Methods("PUT")
	unix_plugin_router.HandleFunc("/down", down).Methods("PUT")
	unix_plugin_router.HandleFunc("/update_container", updateContainer).Methods("PUT")
	unix_plugin_router.HandleFunc("/update", update).Methods("PUT")
	unix_plugin_router.HandleFunc("/remove", removeUserContainer).Methods("PUT")
	unix_plugin_router.HandleFunc("/build", build).Methods("PUT")
	unix_plugin_router.HandleFunc("/user_plugin_exists", userPluginExists).Methods("GET")
	unix_plugin_router.HandleFunc("/get_plugin_config", getUserPluginConfig).Methods("PUT")

	unix_plugin_router.HandleFunc("/ghcr_auth", ghcr_auth).Methods("PUT")
	unix_plugin_router.HandleFunc("/update_git", update_git).Methods("PUT")

	unix_plugin_router.HandleFunc("/git_version", version).Methods("GET")
	unix_plugin_router.HandleFunc("/container_version", container_version).Methods("GET")

	unix_plugin_router.HandleFunc("/remote_container_tags", remote_container_tags).Methods("POST")

	unix_plugin_router.HandleFunc("/docker_ps", docker_ps).Methods("GET")
	unix_plugin_router.HandleFunc("/docker_info", docker_info).Methods("GET")

	// get/set release channel
	unix_plugin_router.HandleFunc("/release", release_info).Methods("GET", "PUT", "DELETE")

	unix_plugin_router.HandleFunc("/compose_paths", compose_paths).Methods("GET")

	unix_plugin_router.HandleFunc("/authorizedKeys", getAuthorizedKeys).Methods("GET")
	unix_plugin_router.HandleFunc("/authorizedKeys", deployAuthorizedKeys).Methods("PUT")
	unix_plugin_router.HandleFunc("/time/sync", syncTime).Methods("PUT")

	os.Remove(UNIX_PLUGIN_LISTENER)
	unixPluginListener, err := net.Listen("unix", UNIX_PLUGIN_LISTENER)
	if err != nil {
		panic(err)
	}
	pluginServer := http.Server{Handler: logRequest(unix_plugin_router)}

	pluginServer.Serve(unixPluginListener)
}
