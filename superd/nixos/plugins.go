package main

// Plugins as systemd units. superd loads a plugin's compose file with
// compose-go (the library docker compose uses) and gives each service:
//   - its image, pulled and unpacked (image.go)
//   - a bundle: an OCI runtime spec (bundle.go) over an overlay of the image
//   - a unit, spr-plugin-<project>-<service>, under /run/systemd/system,
//     that runs it with crun, or krun for the spr-krun runtime of KVM
//     plugins (a libkrun VM, with the policy common.PrepareKrunPolicy signs)
//
// The units' ExecStartPre/ExecStopPost run `superd prepare|cleanup <id>`,
// which mount the overlay and set up the container's network (network.go).
// Units live in /run: the API starts the enabled plugins at boot, which
// writes them again.

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/compose-spec/compose-go/v2/cli"
	"github.com/compose-spec/compose-go/v2/types"
	sprbus "github.com/spr-networks/sprbus-json"
	"golang.org/x/sys/unix"
	"superd/nixos/common"
)

// the OCI runtimes, from the NixOS module
var CrunPath = envOr("SPR_CRUN", "crun")
var KrunPath = envOr("SPR_KRUN", "krun")

var UnitDir = "/run/systemd/system"

// crun's state, the same for crun and krun whatever the environment
const crunRoot = "/run/crun"

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// Container is a plugin service's container, saved as container.json in
// its directory.
type Container struct {
	ID          string
	Name        string
	Project     string
	Service     string
	ComposeFile string
	Image       string
	Digest      string
	Runtime     string // crun or spr-krun
	NetworkMode string // host, none or bridge
	Hostname    string
	Restart     string
	Networks    []Attachment
	Annotations map[string]string
	Labels      map[string]string
	Created     string
}

func containersDir() string { return filepath.Join(PluginRoot, "containers") }

func (c *Container) Dir() string { return filepath.Join(containersDir(), c.ID) }

func (c *Container) Unit() string { return c.ID + ".service" }

var unitNameRe = regexp.MustCompile(`[^a-zA-Z0-9_-]+`)

func containerID(project, service string) string {
	return "spr-plugin-" + unitNameRe.ReplaceAllString(project, "") + "-" + unitNameRe.ReplaceAllString(service, "")
}

func loadContainer(id string) (*Container, error) {
	data, err := os.ReadFile(filepath.Join(containersDir(), id, "container.json"))
	if err != nil {
		return nil, err
	}
	c := &Container{}
	return c, json.Unmarshal(data, c)
}

func allContainers() []*Container {
	list := []*Container{}
	entries, _ := os.ReadDir(containersDir())
	for _, entry := range entries {
		if c, err := loadContainer(entry.Name()); err == nil {
			list = append(list, c)
		}
	}
	sort.Slice(list, func(i, j int) bool { return list[i].ID < list[j].ID })
	return list
}

func composeEnv() []string {
	return append(os.Environ(), "SUPERDIR="+common.SuperRootPath+"/")
}

// loadProject loads a compose file (relative to the super directory).
func loadProject(composeFile string) (*types.Project, error) {
	path := filepath.Join(common.SuperRootPath, composeFile)
	options, err := cli.NewProjectOptions([]string{path},
		cli.WithWorkingDirectory(filepath.Dir(path)),
		cli.WithEnv(composeEnv()),
		cli.WithDotEnv,
		cli.WithInterpolation(true),
		cli.WithResolvedPaths(true),
	)
	if err != nil {
		return nil, err
	}
	project, err := cli.ProjectFromOptions(context.Background(), options)
	if err != nil {
		return nil, fmt.Errorf("load %s: %w", composeFile, err)
	}
	return project, nil
}

// loadKrunComposeConfig gives common.PrepareKrunPolicy the services of a
// compose file, as docker compose config would.
func loadKrunComposeConfig(composeFile string) (common.KrunComposeConfig, error) {
	config := common.KrunComposeConfig{Services: map[string]common.KrunComposeService{}}
	project, err := loadProject(composeFile)
	if err != nil {
		return config, fmt.Errorf("resolve KVM plugin compose configuration: %w", err)
	}
	for name, svc := range project.Services {
		config.Services[name] = common.KrunComposeService{Runtime: svc.Runtime, Annotations: svc.Annotations}
	}
	return config, nil
}

// pluginCompose reports whether superd runs composeFile as plugin units:
// Plus and user plugins. Other compose files are SPR's own, units of the
// NixOS configuration.
func pluginCompose(composeFile string) bool {
	return strings.HasPrefix(filepath.Clean(composeFile), "plugins/")
}

var pluginMtx sync.Mutex

func selectedServices(project *types.Project, target string) ([]types.ServiceConfig, error) {
	names := []string{}
	if target == "" {
		for name := range project.Services {
			names = append(names, name)
		}
	} else {
		names = strings.Fields(target)
	}
	sort.Strings(names)
	list := []types.ServiceConfig{}
	for _, name := range names {
		svc, ok := project.Services[name]
		if !ok {
			return nil, fmt.Errorf("no such service: %s", name)
		}
		list = append(list, svc)
	}
	return list, nil
}

func runtimeFor(svc types.ServiceConfig) (string, error) {
	switch svc.Runtime {
	case "", "runc", "crun":
		return "crun", nil
	case "spr-krun":
		return "spr-krun", nil
	}
	return "", fmt.Errorf("service %s: runtime %q is not available on this system", svc.Name, svc.Runtime)
}

// verifyImage checks a plugin image's build provenance before it is pulled,
// as the docker superd does on the main release channel: SPR's own and the
// spr-networks plugin images need an attestation from their repository's
// workflow (common.AttestationPolicyForImage), other images have no policy.
// It returns the verified digest to pull, so the tag can't move after the
// check.
var verifyImage = func(ref string) (string, error) {
	if common.GetReleaseChannel() != "" {
		return "", nil
	}
	policy := common.AttestationPolicyForImage(ref)
	if policy == nil {
		return "", nil
	}
	digest := ""
	if i := strings.Index(ref, "@sha256:"); i != -1 {
		digest = ref[i+1:]
	} else {
		var err error
		if digest, err = common.ResolveRemoteDigestAny(ref); err != nil {
			return "", fmt.Errorf("attestation of %s: %w", ref, err)
		}
	}
	var err error
	if policy.Registry {
		host, repo, _ := common.SplitImageRef(strings.SplitN(ref, "@", 2)[0])
		err = common.VerifyRegistryAttestation(host, repo, digest, policy.SANRegex)
	} else {
		err = common.VerifyGithubAttestation("spr-networks/super", digest, policy.SANRegex)
	}
	if err != nil {
		sprbus.Publish("superd:attest:failure", map[string]string{"Image": ref, "Digest": digest, "Reason": err.Error()})
		return "", fmt.Errorf("provenance verification failed: %s: %w", ref, err)
	}
	sprbus.Publish("superd:attest:ok", map[string]string{"Image": ref, "Digest": digest})
	return digest, nil
}

func ensureImage(ref string, pull bool) (Image, error) {
	if !pull {
		if img, ok := localImage(ref); ok {
			return img, nil
		}
	}
	return pullImage(ref, verifyImage)
}

// composeUp creates and starts a compose file's containers (compose up -d):
// a container whose spec changed is restarted, a running one left alone.
func composeUp(composeFile, target string, pull bool) error {
	pluginMtx.Lock()
	defer pluginMtx.Unlock()

	if !common.ComposePathAllowed(composeFile) {
		return fmt.Errorf("compose file path is not whitelisted: %s", composeFile)
	}
	grant, err := common.PrepareKrunPolicy(composeFile)
	if err != nil {
		return err
	}
	project, err := loadProject(composeFile)
	if err != nil {
		return err
	}
	services, err := selectedServices(project, target)
	if err != nil {
		return err
	}

	networkMtx.Lock()
	networks := loadNetworks()
	networkMtx.Unlock()

	containers := []*Container{}
	changed := map[string]bool{}
	for _, svc := range services {
		c, specChanged, err := createContainer(project, svc, composeFile, grant, networks, pull)
		if err != nil {
			return err
		}
		containers = append(containers, c)
		changed[c.ID] = specChanged
	}

	networkMtx.Lock()
	err = saveNetworks(networks)
	networkMtx.Unlock()
	if err != nil {
		return err
	}
	for _, n := range networks {
		if n.Project == project.Name {
			if err := ensureBridge(n); err != nil {
				return err
			}
		}
	}
	if err := systemctl("daemon-reload"); err != nil {
		return err
	}
	for _, c := range containers {
		action := "start"
		if changed[c.ID] && unitActive(c.ID) {
			action = "restart"
		}
		if err := systemctl(action, c.Unit()); err != nil {
			return err
		}
	}
	return nil
}

func createContainer(project *types.Project, svc types.ServiceConfig, composeFile string,
	grant *common.KrunGrant, networks map[string]*Network, pull bool) (*Container, bool, error) {
	runtimeName, err := runtimeFor(svc)
	if err != nil {
		return nil, false, err
	}
	if svc.Image == "" {
		return nil, false, fmt.Errorf("service %s has no image (building images is not supported on NixOS)", svc.Name)
	}
	img, err := ensureImage(svc.Image, pull)
	if err != nil {
		return nil, false, err
	}

	id := containerID(project.Name, svc.Name)
	c := &Container{
		ID:          id,
		Name:        firstNonEmpty(svc.ContainerName, project.Name+"-"+svc.Name+"-1"),
		Project:     project.Name,
		Service:     svc.Name,
		ComposeFile: composeFile,
		Image:       svc.Image,
		Digest:      img.Digest,
		Runtime:     runtimeName,
		Restart:     svc.Restart,
		Annotations: map[string]string{},
		Labels: map[string]string{
			"com.docker.compose.project": project.Name,
			"com.docker.compose.service": svc.Name,
		},
		Created: time.Now().UTC().Format(time.RFC3339Nano),
	}
	for k, v := range img.Config.Labels {
		c.Labels[k] = v
	}
	for k, v := range svc.Labels {
		c.Labels[k] = v
	}
	c.Hostname = firstNonEmpty(svc.Hostname, c.Name)

	socketMounts := []string{}
	if runtimeName == "spr-krun" {
		if grant == nil || grant.Service != svc.Name {
			return nil, false, fmt.Errorf("service %s: spr-krun is only for the KVM plugin service authorized from docker-compose-kvm.yml", svc.Name)
		}
		c.Annotations[common.KrunPolicyAnnotation] = grant.Token
		socketMounts = grant.SocketMounts
	}

	switch svc.NetworkMode {
	case "host":
		c.NetworkMode = "host"
	case "none":
		c.NetworkMode = "none"
	case "":
		c.NetworkMode = "bridge"
		if err := attachNetworks(c, project, svc, networks); err != nil {
			return nil, false, err
		}
	default:
		return nil, false, fmt.Errorf("service %s: network_mode %q is not supported", svc.Name, svc.NetworkMode)
	}

	spec, err := buildSpec(c, svc, img, socketMounts)
	if err != nil {
		return nil, false, fmt.Errorf("service %s: %w", svc.Name, err)
	}
	if err := os.MkdirAll(c.Dir(), 0700); err != nil {
		return nil, false, err
	}
	specData, _ := json.MarshalIndent(spec, "", "  ")
	old, _ := os.ReadFile(filepath.Join(c.Dir(), "config.json"))
	changed := string(old) != string(specData)

	// a new spec is a new container: drop the old one's writes, as compose
	// recreating it would
	if changed {
		if unitActive(c.ID) {
			systemctl("stop", c.Unit())
		}
		os.RemoveAll(filepath.Join(c.Dir(), "upper"))
		os.RemoveAll(filepath.Join(c.Dir(), "work"))
	}
	if err := writeContainerFiles(c, specData); err != nil {
		return nil, false, err
	}
	unitChanged, err := writeUnit(c)
	if err != nil {
		return nil, false, err
	}
	return c, changed || unitChanged, nil
}

// projectNetwork records the compose network key of a project.
func projectNetwork(project *types.Project, key string, networks map[string]*Network) (*Network, error) {
	config, ok := project.Networks[key]
	if !ok {
		return nil, fmt.Errorf("undefined network %s", key)
	}
	if bool(config.External) {
		return nil, fmt.Errorf("network %s: external networks are not supported", key)
	}
	if config.Driver != "" && config.Driver != "bridge" {
		return nil, fmt.Errorf("network %s: driver %q is not supported", key, config.Driver)
	}
	subnet, gateway := "", ""
	if len(config.Ipam.Config) > 0 && config.Ipam.Config[0] != nil {
		subnet, gateway = config.Ipam.Config[0].Subnet, config.Ipam.Config[0].Gateway
	}
	return ensureNetwork(networks, config.Name, project.Name, config.DriverOpts, subnet, gateway)
}

// createNetworks creates a compose file's networks and their bridges, as
// docker compose does before it creates containers.
func createNetworks(composeFile string) error {
	project, err := loadProject(composeFile)
	if err != nil {
		return err
	}
	networkMtx.Lock()
	networks := loadNetworks()
	created := []*Network{}
	for _, svc := range project.Services {
		if svc.NetworkMode != "" {
			continue
		}
		for key := range svc.Networks {
			n, err := projectNetwork(project, key, networks)
			if err != nil {
				networkMtx.Unlock()
				return err
			}
			created = append(created, n)
		}
	}
	err = saveNetworks(networks)
	networkMtx.Unlock()
	if err != nil {
		return err
	}
	for _, n := range created {
		if err := ensureBridge(n); err != nil {
			return err
		}
	}
	return nil
}

func attachNetworks(c *Container, project *types.Project, svc types.ServiceConfig, networks map[string]*Network) error {
	keys := []string{}
	for key := range svc.Networks {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for i, key := range keys {
		n, err := projectNetwork(project, key, networks)
		if err != nil {
			return fmt.Errorf("service %s: %w", svc.Name, err)
		}
		ipv4, mac := "", ""
		if sn := svc.Networks[key]; sn != nil {
			ipv4, mac = sn.Ipv4Address, sn.MacAddress
		}
		e, err := attach(n, c.ID, c.Name, ipv4, mac)
		if err != nil {
			return err
		}
		c.Networks = append(c.Networks, Attachment{
			Network: n.Name, Bridge: n.Bridge, Ifname: fmt.Sprintf("eth%d", i),
			IP: e.IP, Gateway: n.Gateway, MAC: e.MAC, Inhibit: n.Inhibit, DefaultRoute: i == 0,
		})
	}
	return nil
}

func lanIP() string {
	data, err := os.ReadFile(filepath.Join(common.SuperRootPath, "configs/base/lanip"))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

func writeContainerFiles(c *Container, spec []byte) error {
	dir := c.Dir()
	for _, sub := range []string{"rootfs", "upper", "work"} {
		if err := os.MkdirAll(filepath.Join(dir, sub), 0755); err != nil {
			return err
		}
	}
	hosts := "127.0.0.1\tlocalhost\n::1\tlocalhost ip6-localhost ip6-loopback\n"
	for _, a := range c.Networks {
		hosts += strings.SplitN(a.IP, "/", 2)[0] + "\t" + c.Hostname + "\n"
	}
	// bridged containers resolve through SPR's DNS, as their devices do;
	// host network ones get a copy of the host's, as with Docker
	resolv := "nameserver " + firstNonEmpty(lanIP(), "192.168.2.1") + "\n"
	if c.NetworkMode == "host" {
		if data, err := os.ReadFile("/etc/resolv.conf"); err == nil {
			resolv = string(data)
		}
	}
	files := map[string]string{
		"hosts": hosts, "hostname": c.Hostname + "\n", "resolv.conf": resolv,
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0644); err != nil {
			return err
		}
	}
	meta, _ := json.MarshalIndent(c, "", "  ")
	if err := writeFileAtomic(filepath.Join(dir, "container.json"), meta, 0600); err != nil {
		return err
	}
	return writeFileAtomic(filepath.Join(dir, "config.json"), spec, 0600)
}

func restartPolicy(policy string) string {
	switch strings.SplitN(policy, ":", 2)[0] {
	case "always", "unless-stopped":
		return "always"
	case "on-failure":
		return "on-failure"
	}
	return "no"
}

func writeUnit(c *Container) (bool, error) {
	self, err := os.Executable()
	if err != nil {
		return false, err
	}
	runtimeBin := CrunPath
	if c.Runtime == "spr-krun" {
		runtimeBin = KrunPath
	}
	// the container stays in the unit's cgroup, so stopping the unit ends it
	unit := fmt.Sprintf(`[Unit]
Description=SPR plugin %s (%s)
After=spr-api.service spr-base.service
Requires=spr-base.service

[Service]
Type=simple
Environment="PATH=%s"
ExecStartPre=%s prepare %s
ExecStart=%s --root %s --cgroup-manager=disabled run --bundle %s %s
ExecStopPost=-%s --root %s --cgroup-manager=disabled delete --force %s
ExecStopPost=%s cleanup %s
Restart=%s
RestartSec=5
KillMode=mixed
TimeoutStopSec=10
`, c.Service, c.Project,
		os.Getenv("PATH"),
		self, c.ID,
		runtimeBin, crunRoot, c.Dir(), c.ID,
		CrunPath, crunRoot, c.ID,
		self, c.ID,
		restartPolicy(c.Restart))
	path := filepath.Join(UnitDir, c.Unit())
	old, _ := os.ReadFile(path)
	if string(old) == unit {
		return false, nil
	}
	return true, writeFileAtomic(path, []byte(unit), 0644)
}

func systemctl(args ...string) error {
	out, err := exec.Command("systemctl", args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("systemctl %s: %v: %s", strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return nil
}

func unitActive(id string) bool {
	return exec.Command("systemctl", "is-active", "--quiet", id+".service").Run() == nil
}

type unitState struct {
	ActiveState          string
	SubState             string
	MainPID              int
	ActiveEnterTimestamp string
	ExecMainStatus       int
}

func showUnit(id string) unitState {
	out, _ := exec.Command("systemctl", "show", id+".service", "--timestamp=utc",
		"-p", "ActiveState,SubState,MainPID,ActiveEnterTimestamp,ExecMainStatus").Output()
	s := unitState{}
	for _, line := range strings.Split(string(out), "\n") {
		k, v, _ := strings.Cut(line, "=")
		switch k {
		case "ActiveState":
			s.ActiveState = v
		case "SubState":
			s.SubState = v
		case "MainPID":
			fmt.Sscan(v, &s.MainPID)
		case "ExecMainStatus":
			fmt.Sscan(v, &s.ExecMainStatus)
		case "ActiveEnterTimestamp":
			if t, err := time.Parse("Mon 2006-01-02 15:04:05 MST", v); err == nil {
				s.ActiveEnterTimestamp = t.UTC().Format(time.RFC3339Nano)
			}
		}
	}
	return s
}

// projectContainers lists a compose file's containers, optionally only the
// target services.
func projectContainers(composeFile, target string) []*Container {
	wanted := map[string]bool{}
	for _, s := range strings.Fields(target) {
		wanted[s] = true
	}
	list := []*Container{}
	for _, c := range allContainers() {
		if c.ComposeFile == composeFile && (len(wanted) == 0 || wanted[c.Service]) {
			list = append(list, c)
		}
	}
	return list
}

func composeStop(composeFile, target string) error {
	for _, c := range projectContainers(composeFile, target) {
		if err := systemctl("stop", c.Unit()); err != nil {
			return err
		}
	}
	return nil
}

func composeRestart(composeFile, target string) error {
	list := projectContainers(composeFile, target)
	if len(list) == 0 {
		return composeUp(composeFile, target, false)
	}
	for _, c := range list {
		if _, err := os.Stat(filepath.Join(UnitDir, c.Unit())); err != nil {
			// units are in /run: after a reboot, write them again
			return composeUp(composeFile, target, false)
		}
		if err := systemctl("restart", c.Unit()); err != nil {
			return err
		}
	}
	return nil
}

// composeDown removes a compose file's containers and networks.
func composeDown(composeFile, target string) error {
	pluginMtx.Lock()
	defer pluginMtx.Unlock()

	list := projectContainers(composeFile, target)
	networkMtx.Lock()
	defer networkMtx.Unlock()
	networks := loadNetworks()
	projects := map[string]bool{}
	for _, c := range list {
		systemctl("stop", c.Unit())
		os.Remove(filepath.Join(UnitDir, c.Unit()))
		cleanup(c.ID)
		os.RemoveAll(c.Dir())
		detach(networks, c.ID)
		projects[c.Project] = true
	}
	for project := range projects {
		removeUnusedNetworks(networks, project)
	}
	systemctl("daemon-reload")
	inUse := map[string]bool{}
	for _, c := range allContainers() {
		inUse[c.Digest] = true
	}
	pruneImages(inUse)
	return saveNetworks(networks)
}

// composePull pulls a compose file's images; it reports whether any
// changed.
func composePull(composeFile, target string) (bool, error) {
	//as composeUp: pulling also creates the compose file's networks as root
	if !common.ComposePathAllowed(composeFile) {
		return false, fmt.Errorf("compose file path is not whitelisted: %s", composeFile)
	}
	project, err := loadProject(composeFile)
	if err != nil {
		return false, err
	}
	services, err := selectedServices(project, target)
	if err != nil {
		return false, err
	}
	changed := false
	for _, svc := range services {
		if svc.Image == "" {
			continue
		}
		before, _ := localImage(svc.Image)
		img, err := pullImage(svc.Image, verifyImage)
		if err != nil {
			return false, err
		}
		changed = changed || img.Digest != before.Digest
	}
	return changed, createNetworks(composeFile)
}

// prepare runs before a container starts: the overlay over its image, and
// its network namespace.
func prepare(id string) error {
	c, err := loadContainer(id)
	if err != nil {
		return err
	}
	cleanup(id)
	img, ok := readImage(c.Image, c.Digest)
	if !ok {
		return fmt.Errorf("image %s (%s) is not unpacked", c.Image, c.Digest)
	}
	dir := c.Dir()
	options := fmt.Sprintf("lowerdir=%s,upperdir=%s,workdir=%s",
		img.Rootfs(), filepath.Join(dir, "upper"), filepath.Join(dir, "work"))
	if err := unix.Mount("overlay", filepath.Join(dir, "rootfs"), "overlay", 0, options); err != nil {
		return fmt.Errorf("mount overlay for %s: %w", id, err)
	}
	if c.NetworkMode == "bridge" || c.NetworkMode == "none" {
		if err := netUp(id, c.Networks); err != nil {
			cleanup(id)
			return err
		}
	}
	return nil
}

func cleanup(id string) {
	netDown(id)
	rootfs := filepath.Join(containersDir(), id, "rootfs")
	for unix.Unmount(rootfs, unix.MNT_DETACH) == nil {
	}
}

// Docker API container objects, for the API and UI (docker_info)
type dockerContainer struct {
	Id              string
	Names           []string
	Image           string
	ImageID         string
	Command         string
	Created         int64
	State           string
	Status          string
	Labels          map[string]string
	HostConfig      map[string]string
	NetworkSettings struct {
		Networks map[string]dockerEndpoint
	}
}

type dockerEndpoint struct {
	NetworkID   string
	IPAddress   string
	IPPrefixLen int
	Gateway     string
	MacAddress  string
}

func dockerState(s unitState) (string, string) {
	switch s.ActiveState {
	case "active":
		return "running", "Up"
	case "activating", "reloading":
		return "restarting", "Restarting"
	}
	return "exited", fmt.Sprintf("Exited (%d)", s.ExecMainStatus)
}

func containerJSON(c *Container) dockerContainer {
	s := showUnit(c.ID)
	d := dockerContainer{
		Id: c.ID, Names: []string{"/" + c.Name}, Image: c.Image, ImageID: c.Digest,
		Labels: c.Labels, HostConfig: map[string]string{"NetworkMode": c.NetworkMode},
	}
	if t, err := time.Parse(time.RFC3339Nano, c.Created); err == nil {
		d.Created = t.Unix()
	}
	d.State, d.Status = dockerState(s)
	d.NetworkSettings.Networks = map[string]dockerEndpoint{}
	if c.NetworkMode == "host" {
		d.NetworkSettings.Networks["host"] = dockerEndpoint{NetworkID: networkID("host")}
	}
	for _, a := range c.Networks {
		ip, prefix, _ := strings.Cut(a.IP, "/")
		e := dockerEndpoint{NetworkID: networkID(a.Network), Gateway: a.Gateway, MacAddress: a.MAC}
		if d.State == "running" {
			e.IPAddress = ip
			fmt.Sscan(prefix, &e.IPPrefixLen)
		}
		d.NetworkSettings.Networks[a.Network] = e
	}
	return d
}

// containerPID is the container's init process (crun state), as Docker's
// State.Pid: for krun, the VM.
func containerPID(id string) int {
	out, err := exec.Command(CrunPath, "--root", crunRoot, "state", id).Output()
	if err != nil {
		return 0
	}
	state := struct{ Pid int }{}
	json.Unmarshal(out, &state)
	return state.Pid
}

// the running plugin containers, for the VM inventory
func pluginVMContainers() ([]common.VMContainer, bool) {
	list := []common.VMContainer{}
	for _, c := range allContainers() {
		s := showUnit(c.ID)
		if s.ActiveState != "active" {
			continue
		}
		state, _ := dockerState(s)
		list = append(list, common.VMContainer{
			ID: c.ID, Name: c.Name, PID: containerPID(c.ID), State: state, Runtime: c.Runtime,
			Image: c.Image, StartedAt: s.ActiveEnterTimestamp, Annotations: c.Annotations,
		})
	}
	return list, true
}

// docker compose ps --format json: one object per line
func composePS(composeFile, target string) string {
	lines := []string{}
	for _, c := range projectContainers(composeFile, target) {
		s := showUnit(c.ID)
		state, status := dockerState(s)
		exitCode := 0
		if state == "exited" {
			exitCode = s.ExecMainStatus
		}
		line, _ := json.Marshal(map[string]interface{}{
			"ID": c.ID, "Name": c.Name, "Names": c.Name, "Service": c.Service, "Project": c.Project,
			"Image": c.Image, "State": state, "Status": status, "Health": "", "ExitCode": exitCode,
		})
		lines = append(lines, string(line))
	}
	return strings.Join(lines, "\n")
}
