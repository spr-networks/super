/*
superd - SPR service supervisor (NixOS/systemd native)

Replaces the Docker-based superd (../code) with the same unix socket
HTTP API, so the SPR API binary needs no changes. common/ holds the parts
taken from the docker superd: plugin installs, compose allow-lists, release
info, KVM plugin policies and attestation checks. It is a copy, so NixOS
changes stay out of the docker superd; keep fixes in step by hand.

SPR's own services are systemd units of the NixOS configuration:

	/restart → systemctl restart spr-<service>
	/start   → systemctl start spr-<service>
	/stop    → systemctl stop spr-<service>

Plugin compose files run as units superd writes (plugins.go), with crun,
or krun for KVM plugins.
*/
package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/gorilla/mux"
	sprbus "github.com/spr-networks/sprbus-json"
	"superd/nixos/common"
)

// Map docker-compose service names to systemd unit names
var serviceMap = map[string]string{
	"base":                "spr-base",
	"api":                 "spr-api",
	"dns":                 "spr-dns",
	"dhcp":                "spr-dhcp",
	"dhcp_client":         "spr-dhcp-client",
	"wifid":               "spr-wifid",
	"wireguard":           "spr-wireguard",
	"multicast_udp_proxy": "spr-multicast-proxy",
	"packet_logs":         "spr-packet-logs",
	"db":                  "spr-db",
	"plugin-lookup":       "spr-plugin-lookup",
	"superd":              "spr-superd",
}

// their docker-compose.yml container names, for docker_info
var containerNames = map[string]string{
	"base": "superbase", "api": "superapi", "dns": "superdns", "dhcp": "superdhcp",
	"dhcp_client": "superdhcp_client", "wifid": "superwifid", "wireguard": "superwireguard",
	"multicast_udp_proxy": "super_multicast_udp_proxy", "packet_logs": "superpacket_logs",
	"db": "superdb", "plugin-lookup": "superplugin-lookup", "superd": "superd",
}

// resolveUnit maps a service name (from docker-compose) to a systemd unit.
// If unrecognized, assume spr-<name> pattern.
func resolveUnit(service string) string {
	if unit, ok := serviceMap[service]; ok {
		return unit
	}
	// sanitize: only allow alphanumeric, dash, underscore
	re := regexp.MustCompile(`[^a-zA-Z0-9_-]`)
	clean := re.ReplaceAllString(service, "")
	if clean == "" {
		return ""
	}
	return "spr-" + clean
}

// Plugins of this repo the NixOS configuration has units for
var composeMap = map[string]string{
	"dyndns/docker-compose.yml":      "spr-dyndns",
	"ppp/docker-compose.yml":         "spr-ppp",
	"wifi_uplink/docker-compose.yml": "spr-wifi-uplink",
}

// unitForRequest picks the unit from ?service= or ?compose_file=.
// Neither set means all SPR services, as with docker compose.
func unitForRequest(r *http.Request) string {
	if service := r.URL.Query().Get("service"); service != "" {
		return resolveUnit(service)
	}
	compose := r.URL.Query().Get("compose_file")
	if compose == "" || compose == "docker-compose.yml" {
		return ""
	}
	if unit, ok := composeMap[strings.TrimPrefix(compose, "./")]; ok {
		return unit
	}
	// otherwise name the unit after the compose file's directory
	return resolveUnit(filepath.Base(filepath.Dir(compose)))
}

func systemctlUnit(action string, unit string) ([]byte, error) {
	target := "spr-*"
	if unit != "" {
		target = unit + ".service"
	}
	out, err := exec.Command("systemctl", action, target).CombinedOutput()
	if err != nil {
		sprbus.Publish("plugin:systemd:failure", map[string]string{
			"Reason":  "systemctl command failed",
			"Action":  action,
			"Unit":    unit,
			"Message": string(out),
		})
	}
	return out, err
}

func publishPluginFailure(composeFile string, err error) {
	fmt.Println("failure: " + err.Error())
	sprbus.Publish("plugin:docker:failure", map[string]string{
		"Reason": "plugin command failed", "Message": err.Error(), "ComposeFile": composeFile,
	})
}

// pluginRequest returns the plugin compose file of a request, if any.
func pluginRequest(r *http.Request) (string, string, bool) {
	compose := strings.TrimPrefix(r.URL.Query().Get("compose_file"), "./")
	return compose, r.URL.Query().Get("service"), pluginCompose(compose)
}

func restart(w http.ResponseWriter, r *http.Request) {
	if compose, target, ok := pluginRequest(r); ok {
		go func() {
			if err := composeRestart(compose, target); err != nil {
				publishPluginFailure(compose, err)
			}
		}()
		return
	}
	out, err := systemctlUnit("restart", unitForRequest(r))
	if err != nil {
		http.Error(w, fmt.Sprintf("restart failed: %s\n%s", err, out), 500)
		return
	}
	fmt.Fprintf(w, "OK")
}

func start(w http.ResponseWriter, r *http.Request) {
	if compose, target, ok := pluginRequest(r); ok {
		if err := composeUp(compose, target, false); err != nil {
			publishPluginFailure(compose, err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}
	out, err := systemctlUnit("start", unitForRequest(r))
	if err != nil {
		http.Error(w, fmt.Sprintf("start failed: %s\n%s", err, out), 500)
		return
	}
	fmt.Fprintf(w, "OK")
}

func stop(w http.ResponseWriter, r *http.Request) {
	if compose, target, ok := pluginRequest(r); ok {
		go composeStop(compose, target)
		return
	}
	unit := unitForRequest(r)
	go systemctlUnit("stop", unit)
	fmt.Fprintf(w, "OK")
}

// remove a plugin's containers and networks (docker compose down)
func down(w http.ResponseWriter, r *http.Request) {
	compose, target, ok := pluginRequest(r)
	if !ok {
		// SPR's own services are not removed; down stops them
		go systemctlUnit("stop", unitForRequest(r))
		return
	}
	go composeDown(compose, target)
}

func removeUserContainer(w http.ResponseWriter, r *http.Request) {
	compose, target, _ := pluginRequest(r)
	if regexp.MustCompile(`^plugins/user/[A-Za-z0-9\-]+$`).MatchString(filepath.Dir(compose)) {
		go composeDown(compose, target)
	}
}

func update(w http.ResponseWriter, r *http.Request) {
	compose, target, ok := pluginRequest(r)
	if !ok {
		// SPR itself updates as a whole NixOS system (sysupdate.go)
		systemUpdate(w, r)
		return
	}
	if _, err := composePull(compose, target); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func updateContainer(w http.ResponseWriter, r *http.Request) {
	compose, _, ok := pluginRequest(r)
	if !ok {
		http.Error(w, "compose_file required", 400)
		return
	}
	updated, err := composePull(compose, "")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	updated = updated || r.URL.Query().Get("force") == "1"
	if updated {
		if err := composeDown(compose, ""); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		if err := composeUp(compose, "", false); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"Updated": updated})
}

func build(w http.ResponseWriter, r *http.Request) {
	http.Error(w, "building plugin images is not supported on NixOS: use the plugin's published image", http.StatusBadRequest)
}

func switchPluginRuntime(w http.ResponseWriter, r *http.Request) {
	common.SwitchPluginRuntime(w, r,
		func(compose string) error { return composeDown(compose, "") },
		func(compose string) error { return composeUp(compose, "", false) })
}

// ServiceStatus mirrors docker compose ps JSON output enough for the API
type ServiceStatus struct {
	Name    string `json:"Name"`
	Service string `json:"Service"`
	State   string `json:"State"`
	Status  string `json:"Status"`
}

func docker_ps(w http.ResponseWriter, r *http.Request) {
	if compose, target, ok := pluginRequest(r); ok {
		if !common.ComposePathAllowed(compose) {
			http.Error(w, "Invalid compose file, failed", 400)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(composePS(compose, target))
		return
	}

	target := r.URL.Query().Get("service")
	unit := unitForRequest(r)
	if target == "" {
		target = unit
	}

	var cmd *exec.Cmd
	if unit != "" {
		cmd = exec.Command("systemctl", "show", unit+".service",
			"--property=ActiveState,SubState,Description", "--no-pager")
	} else {
		cmd = exec.Command("systemctl", "list-units", "spr-*",
			"--type=service", "--no-pager", "--no-legend", "--plain")
	}

	out, err := cmd.Output()
	if err != nil {
		http.Error(w, "Command failed", 400)
		return
	}

	statuses := []ServiceStatus{}
	if unit != "" {
		// Parse "show" output: Key=Value lines
		props := map[string]string{}
		for _, line := range strings.Split(string(out), "\n") {
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				props[parts[0]] = parts[1]
			}
		}
		statuses = append(statuses, ServiceStatus{
			Name:    unit,
			Service: target,
			State:   mapState(props["ActiveState"]),
			Status:  props["SubState"],
		})
	} else {
		// Parse "list-units" output
		for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			fields := strings.Fields(line)
			if len(fields) < 4 {
				continue
			}
			unitName := strings.TrimSuffix(fields[0], ".service")
			statuses = append(statuses, ServiceStatus{
				Name:    unitName,
				Service: strings.TrimPrefix(unitName, "spr-"),
				State:   mapState(fields[2]),
				Status:  fields[3],
			})
		}
	}
	jsonOut, _ := json.Marshal(statuses)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(string(jsonOut))
}

// mapState converts systemd ActiveState to docker-like state names
func mapState(active string) string {
	switch active {
	case "active":
		return "running"
	case "inactive":
		return "exited"
	case "failed":
		return "exited"
	case "activating":
		return "restarting"
	default:
		return active
	}
}

// the SPR services, as host network containers
func serviceContainers() []dockerContainer {
	list := []dockerContainer{}
	for service, unit := range serviceMap {
		s := showUnit(unit)
		if s.ActiveState == "" || s.ActiveState == "inactive" && s.SubState == "dead" && s.MainPID == 0 && s.ActiveEnterTimestamp == "" {
			continue
		}
		d := dockerContainer{
			Id: unit, Names: []string{"/" + containerNames[service]},
			Image:  "ghcr.io/spr-networks/super_" + strings.ReplaceAll(service, "-", "_"),
			Labels: map[string]string{"com.docker.compose.service": service},
		}
		d.State, d.Status = dockerState(s)
		d.HostConfig = map[string]string{"NetworkMode": "host"}
		d.NetworkSettings.Networks = map[string]dockerEndpoint{"host": {NetworkID: networkID("host")}}
		list = append(list, d)
	}
	return list
}

func docker_info(w http.ResponseWriter, r *http.Request) {
	var data interface{}
	id := r.URL.Query().Get("id")
	switch r.URL.Query().Get("resource") {
	case "networks":
		networks := dockerNetworks()
		if id == "" {
			data = networks
			break
		}
		for _, n := range networks {
			if n.Id == id || n.Name == id {
				data = n
			}
		}
		if data == nil {
			http.Error(w, "network "+id+" not found", http.StatusNotFound)
			return
		}
	case "containers":
		if id != "" {
			http.Error(w, "container id is not supported", http.StatusBadRequest)
			return
		}
		containers := serviceContainers()
		for _, c := range allContainers() {
			containers = append(containers, containerJSON(c))
		}
		data = containers
	default:
		http.Error(w, "Unsupported resource", 400)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func virtual_machines(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(common.DiscoverVirtualMachines(pluginVMContainers))
}

func plugin_runtime_status(w http.ResponseWriter, r *http.Request) {
	runtime, err := common.NormalizePluginRuntime(r.URL.Query().Get("runtime"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	status := common.PluginRuntimeHostStatus{Runtime: runtime, Ready: true}
	if runtime == common.PluginRuntimeKVM {
		if _, err := os.Stat("/dev/kvm"); err != nil {
			status.Ready, status.Reason = false, "KVM is not available on this system (/dev/kvm)."
		} else if _, err := exec.LookPath(KrunPath); err != nil {
			status.Ready, status.Reason = false, "The spr-krun runtime is not installed on this system."
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// SPR's version: the NixOS system's, or the latest git tag of a plugin
func sprVersion() string {
	return os.Getenv("SPR_VERSION")
}

func version(w http.ResponseWriter, r *http.Request) {
	v := sprVersion()
	if plugin := r.URL.Query().Get("plugin"); plugin != "" {
		v = common.VersionForRepository(filepath.Join(common.SuperRootPath, "plugins", filepath.Clean(plugin)))
	}
	if v == "" {
		http.Error(w, "Failed to retrieve version", 400)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// the org.supernetworks.version label of a plugin container's image; SPR's
// own services share the system's version
func container_version(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Query().Get("container"), "super")
	for _, c := range allContainers() {
		if c.Name == name || c.Name == "super"+name || c.ID == name {
			if v := c.Labels["org.supernetworks.version"]; v != "" {
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(v)
				return
			}
			http.Error(w, "no version label on "+c.Image, 400)
			return
		}
	}
	version(w, r)
}

// registry logins for plugin images, as docker login stores them
func ghcr_auth(w http.ResponseWriter, r *http.Request) {
	creds := common.GitOptions{}
	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		http.Error(w, "Failed to retrieve credentials "+err.Error(), 400)
		return
	}
	if !regexp.MustCompile(`^[a-zA-Z0-9+/=_]*$`).MatchString(creds.Secret) {
		http.Error(w, "Invalid token", 400)
		return
	}
	if creds.Username == "" || creds.Secret == "" {
		http.Error(w, "need username and secret parameters", 400)
		return
	}
	path := filepath.Join(os.Getenv("DOCKER_CONFIG"), "config.json")
	config := map[string]map[string]map[string]string{}
	if data, err := os.ReadFile(path); err == nil {
		json.Unmarshal(data, &config)
	}
	if config["auths"] == nil {
		config["auths"] = map[string]map[string]string{}
	}
	config["auths"]["containers.plus.supernetworks.org"] = map[string]string{
		"auth": base64.StdEncoding.EncodeToString([]byte(creds.Username + ":" + creds.Secret)),
	}
	data, _ := json.MarshalIndent(config, "", "  ")
	if err := writeFileAtomic(path, data, 0600); err != nil {
		http.Error(w, err.Error(), 500)
	}
}

func remote_container_tags(w http.ResponseWriter, r *http.Request) {
	// No-op on NixOS
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct{ Tags []string }{Tags: []string{}})
}

func syncTime(w http.ResponseWriter, r *http.Request) {
	out, err := exec.Command("systemctl", "restart", "systemd-timesyncd").CombinedOutput()
	if err != nil {
		http.Error(w, strings.TrimSpace(string(out)), 500)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func main() {
	superDir := os.Getenv("SUPERDIR")
	if superDir == "" {
		superDir = "/var/lib/spr"
	}
	common.SuperRootPath = superDir
	common.LoadKrunComposeConfig = loadKrunComposeConfig
	if os.Getenv("DOCKER_CONFIG") == "" {
		os.Setenv("DOCKER_CONFIG", filepath.Join(PluginRoot, "docker"))
	}
	// registry logins for attestation checks too
	common.DockerConfigPath = filepath.Join(os.Getenv("DOCKER_CONFIG"), "config.json")

	// unit hooks: superd prepare|cleanup <container>
	if len(os.Args) == 3 {
		switch os.Args[1] {
		case "prepare":
			if err := prepare(os.Args[2]); err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			return
		case "cleanup":
			cleanup(os.Args[2])
			return
		}
	}

	os.Chdir(superDir)
	common.ReloadComposeAllowList()
	ensureBridges()

	unix_plugin_router := mux.NewRouter().StrictSlash(true)

	// Same API surface as the original superd
	unix_plugin_router.HandleFunc("/restart", restart).Methods("PUT")
	unix_plugin_router.HandleFunc("/start", start).Methods("PUT")
	unix_plugin_router.HandleFunc("/stop", stop).Methods("PUT")
	unix_plugin_router.HandleFunc("/down", down).Methods("PUT")
	unix_plugin_router.HandleFunc("/update_container", updateContainer).Methods("PUT")
	unix_plugin_router.HandleFunc("/update", update).Methods("PUT")
	unix_plugin_router.HandleFunc("/remove", removeUserContainer).Methods("PUT")
	unix_plugin_router.HandleFunc("/build", build).Methods("PUT")
	unix_plugin_router.HandleFunc("/user_plugin_exists", common.UserPluginExists).Methods("GET")
	unix_plugin_router.HandleFunc("/get_plugin_config", common.GetUserPluginConfig).Methods("PUT")
	unix_plugin_router.HandleFunc("/switch_plugin_runtime", switchPluginRuntime).Methods("PUT")
	unix_plugin_router.HandleFunc("/plugin_runtime_status", plugin_runtime_status).Methods("GET")

	unix_plugin_router.HandleFunc("/ghcr_auth", ghcr_auth).Methods("PUT")
	unix_plugin_router.HandleFunc("/update_git", common.UpdateGit).Methods("PUT")

	unix_plugin_router.HandleFunc("/git_version", version).Methods("GET")
	unix_plugin_router.HandleFunc("/container_version", container_version).Methods("GET")

	unix_plugin_router.HandleFunc("/remote_container_tags", remote_container_tags).Methods("POST")

	unix_plugin_router.HandleFunc("/docker_ps", docker_ps).Methods("GET")
	unix_plugin_router.HandleFunc("/docker_info", docker_info).Methods("GET")
	unix_plugin_router.HandleFunc("/virtual_machines", virtual_machines).Methods("GET")

	unix_plugin_router.HandleFunc("/release", common.ReleaseInfoHandler(sprVersion)).Methods("GET", "PUT", "DELETE")

	unix_plugin_router.HandleFunc("/compose_paths", common.ComposePaths).Methods("GET")

	unix_plugin_router.HandleFunc("/time/sync", syncTime).Methods("PUT")

	fmt.Println("[+] superd (systemd-native) listening on", common.UnixPluginListener)
	if err := common.Serve(unix_plugin_router); err != nil {
		panic(err)
	}
}
