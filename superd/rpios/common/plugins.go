package common

// User and Plus plugins: fetching them with git, and choosing the compose
// file of the runtime they run under.

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

var SuperRootPath = "/super"
var PlusAddons = "plugins/plus"
var UserAddons = "plugins/user"

type GitOptions struct {
	Username   string
	Secret     string
	Plus       bool
	AutoConfig bool
}

func GitCloneURL(gitURL string, username string, secret string) string {
	scheme := "https://"
	rest := gitURL
	if strings.HasPrefix(gitURL, "https://") {
		rest = strings.TrimPrefix(gitURL, "https://")
	} else if strings.HasPrefix(gitURL, "http://") {
		scheme = "http://"
		rest = strings.TrimPrefix(gitURL, "http://")
	}
	if secret != "" {
		return scheme + username + ":" + secret + "@" + rest
	}
	return scheme + rest
}

func GetRepoName(gitURL string) string {
	trimmedURL := strings.TrimSuffix(gitURL, ".git")
	repoName := filepath.Base(trimmedURL)
	if strings.Contains(repoName, "..") {
		return ""
	}
	return repoName
}

const (
	PluginRuntimeDefault = "default"
	PluginRuntimeKVM     = "kvm"
)

type PluginRuntimeSelection struct {
	Runtime           string
	ComposeFilePath   string
	AvailableRuntimes []string
}

type PluginRuntimeHostStatus struct {
	Runtime string
	Ready   bool
	Reason  string `json:",omitempty"`
}

func NormalizePluginRuntime(runtime string) (string, error) {
	runtime = strings.ToLower(strings.TrimSpace(runtime))
	if runtime == "" {
		return PluginRuntimeDefault, nil
	}
	switch runtime {
	case PluginRuntimeDefault, PluginRuntimeKVM:
		return runtime, nil
	default:
		return "", fmt.Errorf("unsupported plugin runtime %q", runtime)
	}
}

func PluginRuntimeComposeName(runtime string) (string, error) {
	runtime, err := NormalizePluginRuntime(runtime)
	if err != nil {
		return "", err
	}
	if runtime == PluginRuntimeKVM {
		return "docker-compose-kvm.yml", nil
	}
	return "docker-compose.yml", nil
}

func AvailablePluginRuntimes(pluginRelativeDir string) []string {
	runtimes := []string{}
	for _, runtime := range []string{PluginRuntimeDefault, PluginRuntimeKVM} {
		composeName, _ := PluginRuntimeComposeName(runtime)
		info, err := os.Stat(filepath.Join(SuperRootPath, pluginRelativeDir, composeName))
		if err == nil && info.Mode().IsRegular() {
			runtimes = append(runtimes, runtime)
		}
	}
	return runtimes
}

func ResolveUserPluginRuntime(composeFilePath, runtime string) (PluginRuntimeSelection, error) {
	selection := PluginRuntimeSelection{}
	cleanPath := filepath.ToSlash(filepath.Clean(composeFilePath))
	parts := strings.Split(cleanPath, "/")
	if len(parts) != 4 || parts[0] != "plugins" || parts[1] != "user" ||
		!regexp.MustCompile(`^[A-Za-z0-9-]+$`).MatchString(parts[2]) ||
		(parts[3] != "docker-compose.yml" && parts[3] != "docker-compose-kvm.yml") {
		return selection, fmt.Errorf("plugin runtime can only be changed for an installed user plugin")
	}

	runtime, err := NormalizePluginRuntime(runtime)
	if err != nil {
		return selection, err
	}
	composeName, _ := PluginRuntimeComposeName(runtime)
	pluginRelativeDir := filepath.Join(parts[0], parts[1], parts[2])
	targetPath := filepath.ToSlash(filepath.Join(pluginRelativeDir, composeName))
	info, err := os.Stat(filepath.Join(SuperRootPath, targetPath))
	if err != nil {
		return selection, fmt.Errorf("runtime %s is not available for plugin %s: %w", runtime, parts[2], err)
	}
	if !info.Mode().IsRegular() {
		return selection, fmt.Errorf("runtime compose file is not regular: %s", targetPath)
	}

	selection.Runtime = runtime
	selection.ComposeFilePath = targetPath
	selection.AvailableRuntimes = AvailablePluginRuntimes(pluginRelativeDir)
	return selection, nil
}

func ConfigureUserPlugin(repoName string) ([]byte, error) {
	if repoName == "" || filepath.Base(repoName) != repoName || repoName == "." {
		return []byte{}, fmt.Errorf("invalid user plugin repository name %q", repoName)
	}

	pluginRelativeDir := filepath.Join("plugins", "user", repoName)
	pluginConfigPath := filepath.Join(SuperRootPath, pluginRelativeDir, "plugin.json")
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

	runtime, err := NormalizePluginRuntime(manifest.Runtime)
	if err != nil {
		return nil, fmt.Errorf("invalid user plugin config %s: %w", pluginConfigPath, err)
	}
	composeName, _ := PluginRuntimeComposeName(runtime)
	composeRelativePath := filepath.Join(pluginRelativeDir, composeName)
	composePath := filepath.Join(SuperRootPath, composeRelativePath)
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
	config["AvailableRuntimes"] = AvailablePluginRuntimes(pluginRelativeDir)
	return json.Marshal(config)
}

var AddonsMtx sync.Mutex

func UpdateGit(w http.ResponseWriter, r *http.Request) {
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
	}

	if git_url != "" {
		git_url = GitCloneURL(git_url, creds.Username, creds.Secret)
	}

	//never chdir here: policy files are cwd-relative, and other handlers
	//would read them from inside the plugin repo while git runs
	if git_url == "" {
		//update SPR itself
		os.Setenv("GIT_TERMINAL_PROMPT", "0")
		cmd := exec.Command("git", "pull")
		cmd.Dir = SuperRootPath
		out, _ := cmd.CombinedOutput()
		fmt.Println(string(out))
		return
	}

	repo := GetRepoName(git_url)
	if repo == "" {
		http.Error(w, "Invalid git url "+git_url, 400)
		return
	}

	directory := PlusAddons
	if creds.Plus == false {
		directory = UserAddons
	}
	addonsDir := filepath.Join(SuperRootPath, directory)

	if _, err := os.Stat(addonsDir); os.IsNotExist(err) {
		err := os.MkdirAll(addonsDir, 0755)
		if err != nil {
			http.Error(w, "Could not create addons "+directory, 500)
			return
		}
	}

	if info, err := os.Stat(addonsDir); err != nil || !info.IsDir() {
		http.Error(w, "Could not find addons directory", 500)
		return
	}

	os.Setenv("GIT_TERMINAL_PROMPT", "0")
	cmd := exec.Command("git", "clone", "--recurse-submodule", git_url)
	cmd.Dir = addonsDir
	out, _ := cmd.CombinedOutput()
	fmt.Println(string(out))

	if strings.Contains(string(out), "fatal") {
		if !strings.Contains(string(out), "already exists") {
			http.Error(w, "Could not clone repository", 400)
			return
		}
	}

	repoDir := filepath.Join(addonsDir, repo)
	if info, err := os.Stat(repoDir); err != nil || !info.IsDir() {
		http.Error(w, "Could not cd to repository", 400)
		return
	}

	cmd = exec.Command("git", "pull")
	cmd.Dir = repoDir
	out, _ = cmd.CombinedOutput()
	fmt.Println(string(out))

	gitChanged := !strings.Contains(strings.ToLower(string(out)), "up to date")

	if creds.Plus == false && creds.AutoConfig == true {
		data, err := ConfigureUserPlugin(repo)
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
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"Changed": gitChanged})
}

func GetUserPluginConfig(w http.ResponseWriter, r *http.Request) {
	repoName := GetRepoName(r.URL.Query().Get("git_url"))
	if repoName == "" {
		http.Error(w, "invalid user plugin git URL", http.StatusBadRequest)
		return
	}
	data, err := ConfigureUserPlugin(repoName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

func UserPluginExists(w http.ResponseWriter, r *http.Request) {
	git_url := r.URL.Query().Get("git_url")

	baseName := filepath.Base(git_url)
	pluginName := strings.TrimSuffix(baseName, ".git")
	dirName := filepath.Join(SuperRootPath, "plugins", "user", pluginName)

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

// SwitchPluginRuntime serves /switch_plugin_runtime: it moves a user plugin
// to the compose file of another runtime, with down and up from the engine.
func SwitchPluginRuntime(w http.ResponseWriter, r *http.Request, down, up func(composeFile string) error) {
	currentCompose := filepath.ToSlash(filepath.Clean(r.URL.Query().Get("compose_file")))
	selection, err := ResolveUserPluginRuntime(currentCompose, r.URL.Query().Get("runtime"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !ComposePathAllowed(currentCompose) {
		http.Error(w, "current compose file is not authorized", http.StatusForbidden)
		return
	}
	if err := AllowPluginRuntimeCompose(selection.ComposeFilePath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if currentCompose != selection.ComposeFilePath {
		if err := down(currentCompose); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if r.URL.Query().Get("start") != "0" {
			if err := up(selection.ComposeFilePath); err != nil {
				if r.URL.Query().Get("rollback") != "0" {
					rollbackErr := up(currentCompose)
					if rollbackErr != nil {
						http.Error(w, err.Error()+"; rollback failed: "+rollbackErr.Error(), http.StatusInternalServerError)
						return
					}
				}
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(selection)
}

// VersionForRepository is the latest vX.Y.Z tag of the git repository at
// path, or "".
func VersionForRepository(path string) string {
	//git tag -l --sort=-creatordate  | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1
	cmd := exec.Command("git", "-C", path, "tag", "-l", "--sort=-creatordate")
	output, err := cmd.Output()
	if err != nil {
		fmt.Println("[-] version not found", err)
		return ""
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
