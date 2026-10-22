package main

import (
	"archive/tar"
	"bytes"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"superd/nixos/common"
)

// testRoot copies testdata (plugin compose files from their repositories)
// into a super directory, with superd's state directories beside it.
func testRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	if out, err := exec.Command("cp", "-R", "testdata/.", root).CombinedOutput(); err != nil {
		t.Fatalf("copy testdata: %v: %s", err, out)
	}
	saved := []string{common.SuperRootPath, PluginRoot, UnitDir}
	common.SuperRootPath = root
	PluginRoot = t.TempDir()
	UnitDir = t.TempDir()
	common.LoadKrunComposeConfig = loadKrunComposeConfig
	t.Cleanup(func() {
		common.SuperRootPath, PluginRoot, UnitDir = saved[0], saved[1], saved[2]
	})
	return root
}

func requireRoot(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("needs root (krun policies, file ownership)")
	}
}

func TestKVMPluginCompose(t *testing.T) {
	requireRoot(t)
	root := testRoot(t)
	compose := "plugins/user/spr-tailscale/docker-compose-kvm.yml"

	project, err := loadProject(compose)
	if err != nil {
		t.Fatal(err)
	}
	svc, ok := project.Services["spr-tailscale"]
	if !ok {
		t.Fatalf("services = %v", project.ServiceNames())
	}
	// extends docker-compose.yml, with its build reset
	if svc.Runtime != "spr-krun" || svc.Build != nil || svc.Image != "ghcr.io/spr-networks/spr-tailscale:latest" {
		t.Fatalf("runtime %q build %v image %q", svc.Runtime, svc.Build, svc.Image)
	}
	if svc.Annotations["krun.tap_name"] != "kruntap0" || svc.Annotations["krun.cpus"] != "1" {
		t.Fatalf("annotations = %v", svc.Annotations)
	}
	network := project.Networks["tailscalenet"]
	if network.Name != "spr-tailscale" || network.DriverOpts[bridgeNameOpt] != "spr-tailscale" ||
		network.DriverOpts[inhibitIPv4Opt] != "true" {
		t.Fatalf("network = %#v", network)
	}

	grant, err := common.PrepareKrunPolicy(compose)
	if err != nil {
		t.Fatal(err)
	}
	if grant == nil || grant.Service != "spr-tailscale" || len(grant.Token) != 64 || len(grant.SocketMounts) != 2 {
		t.Fatalf("grant = %#v", grant)
	}
	policy, err := os.ReadFile(filepath.Join(common.KrunPolicyRoot, "policies", grant.Token+".json"))
	if err != nil || !strings.Contains(string(policy), `"net_mac": "02:53:50:52:4b:14"`) {
		t.Fatalf("policy %s: %v", policy, err)
	}

	networks := map[string]*Network{}
	c := &Container{ID: containerID(project.Name, svc.Name), Name: svc.ContainerName, Project: project.Name,
		NetworkMode: "bridge", Hostname: svc.ContainerName,
		Annotations: map[string]string{common.KrunPolicyAnnotation: grant.Token}}
	if err := attachNetworks(c, project, svc, networks); err != nil {
		t.Fatal(err)
	}
	a := c.Networks[0]
	if len(c.Networks) != 1 || a.Bridge != "spr-tailscale" || a.Ifname != "eth0" || !a.Inhibit ||
		!strings.HasSuffix(a.IP, "/16") || !strings.HasPrefix(a.MAC, "02:42:") {
		t.Fatalf("attachments = %#v", c.Networks)
	}

	img := Image{Ref: svc.Image, Digest: "sha256:00", Config: ImageConfig{Entrypoint: []string{"/run.sh"}, Env: []string{"A=1"}}}
	if _, err := os.Stat("/dev/net/tun"); err != nil {
		svc.Devices = nil
	}
	spec, err := buildSpec(c, svc, img, grant.SocketMounts)
	if err != nil {
		t.Fatal(err)
	}
	if spec.Annotations[common.KrunPolicyAnnotation] != grant.Token {
		t.Fatalf("annotations = %v", spec.Annotations)
	}
	if !slices.Contains(spec.Process.Capabilities.Bounding, "CAP_NET_ADMIN") ||
		slices.Contains(spec.Process.Capabilities.Bounding, "CAP_SYS_ADMIN") {
		t.Fatalf("caps = %v", spec.Process.Capabilities.Bounding)
	}
	if spec.Linux.Sysctl["net.ipv4.ip_forward"] != "1" {
		t.Fatalf("sysctls = %v", spec.Linux.Sysctl)
	}
	nofile := false
	for _, l := range spec.Process.Rlimits {
		nofile = nofile || l.Type == "RLIMIT_NOFILE" && l.Soft == 65536 && l.Hard == 65536
	}
	if !nofile {
		t.Fatalf("rlimits = %v", spec.Process.Rlimits)
	}
	if !slices.Contains(spec.Process.Env, "SPR_KRUN_VSOCK_PORT=4040") || !slices.Contains(spec.Process.Env, "A=1") {
		t.Fatalf("env = %v", spec.Process.Env)
	}
	targets := map[string]string{}
	for _, m := range spec.Mounts {
		targets[m.Destination] = m.Source
	}
	if targets["/run/spr-krun/listen"] != filepath.Join(root, "state/plugins/spr-tailscale") ||
		targets["/state/public"] != filepath.Join(root, "state/public") {
		t.Fatalf("mounts = %v", targets)
	}
	netns := ""
	for _, ns := range spec.Linux.Namespaces {
		if ns.Type == "network" {
			netns = ns.Path
		}
	}
	if netns != "/run/netns/"+c.ID {
		t.Fatalf("netns = %q", netns)
	}
}

func TestPlusPluginCompose(t *testing.T) {
	testRoot(t)
	for _, compose := range []string{
		"plugins/plus/mesh_extension/docker-compose.yml",
		"plugins/plus/pfw_extension/docker-compose.yml",
	} {
		project, err := loadProject(compose)
		if err != nil {
			t.Fatal(err)
		}
		for _, svc := range project.Services {
			if svc.NetworkMode != "host" || !svc.Privileged {
				t.Fatalf("%s: network %q privileged %v", compose, svc.NetworkMode, svc.Privileged)
			}
			if grant, err := common.PrepareKrunPolicy(compose); err != nil || grant != nil {
				t.Fatalf("%s: krun grant %v %v", compose, grant, err)
			}
			c := &Container{ID: containerID(project.Name, svc.Name), Name: svc.ContainerName, NetworkMode: "host"}
			img := Image{Config: ImageConfig{Cmd: []string{"/scripts/startup.sh"}}}
			spec, err := buildSpec(c, svc, img, nil)
			if err != nil {
				t.Fatal(err)
			}
			if len(spec.Process.Capabilities.Bounding) != len(allCaps) || len(spec.Linux.MaskedPaths) != 0 {
				t.Fatalf("%s: not privileged: %v", compose, spec.Process.Capabilities.Bounding)
			}
			for _, ns := range spec.Linux.Namespaces {
				if ns.Type == "network" || ns.Type == "uts" {
					t.Fatalf("%s: host network service has a %s namespace", compose, ns.Type)
				}
			}
			for _, m := range spec.Mounts {
				// Docker hosts' /etc/timezone, missing on NixOS, is skipped
				if m.Destination == "/etc/timezone" {
					if _, err := os.Stat("/etc/timezone"); err != nil {
						t.Fatalf("%s: mounted missing /etc/timezone", compose)
					}
				}
			}
		}
	}
}

func TestUntarStaysInRoot(t *testing.T) {
	requireRoot(t)
	var buf bytes.Buffer
	tw := tar.NewWriter(&buf)
	tw.WriteHeader(&tar.Header{Name: "etc", Typeflag: tar.TypeSymlink, Linkname: "/", Mode: 0777})
	data := []byte("escaped\n")
	tw.WriteHeader(&tar.Header{Name: "etc/escape", Typeflag: tar.TypeReg, Size: int64(len(data)), Mode: 0644})
	tw.Write(data)
	tw.Close()
	if err := untar(t.TempDir(), &buf); err == nil {
		t.Fatal("unpacked a path through a symlink out of the root")
	}
	if _, err := os.Stat("/escape"); err == nil {
		os.Remove("/escape")
		t.Fatal("a symlinked path escaped the root")
	}

	buf.Reset()
	tw = tar.NewWriter(&buf)
	tw.WriteHeader(&tar.Header{Name: "bin/su", Typeflag: tar.TypeReg, Size: 1, Mode: 04755})
	tw.Write([]byte("x"))
	tw.WriteHeader(&tar.Header{Name: "bin/su2", Typeflag: tar.TypeLink, Linkname: "bin/su"})
	tw.Close()
	dir := t.TempDir()
	if err := untar(dir, &buf); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(dir, "bin/su"))
	if err != nil || info.Mode()&os.ModeSetuid == 0 {
		t.Fatalf("setuid file: %v %v", info, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "bin/su2")); err != nil {
		t.Fatal(err)
	}
}

func TestSubnetAllocation(t *testing.T) {
	networks := map[string]*Network{}
	a, err := ensureNetwork(networks, "a", "p", map[string]string{}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	b, err := ensureNetwork(networks, "b", "p", map[string]string{}, "", "")
	if err != nil {
		t.Fatal(err)
	}
	if a.Subnet == b.Subnet || a.Gateway != strings.TrimSuffix(a.Subnet, "0/16")+"1" {
		t.Fatalf("subnets %s %s gateway %s", a.Subnet, b.Subnet, a.Gateway)
	}
	if _, err := ensureNetwork(networks, "c", "p", map[string]string{bridgeNameOpt: a.Bridge}, "", ""); err == nil {
		t.Fatal("two networks got one bridge")
	}
	e1, _ := attach(a, "one", "one", "", "")
	e2, _ := attach(a, "two", "two", "", "")
	again, _ := attach(a, "one", "one", "", "")
	if e1.IP == e2.IP || again.IP != e1.IP {
		t.Fatalf("addresses %v %v %v", e1, e2, again)
	}
}

func TestVerifyImagePolicy(t *testing.T) {
	saved := common.SuperRootPath
	common.SuperRootPath = t.TempDir()
	t.Cleanup(func() { common.SuperRootPath = saved })

	// no policy for third-party images: pulled by tag, as with docker
	if digest, err := verifyImage("docker.io/library/alpine:3"); err != nil || digest != "" {
		t.Fatalf("third-party image: %q %v", digest, err)
	}
	if _, err := net.LookupHost("ghcr.io"); testing.Short() || err != nil {
		t.Skip("attestation checks need the network")
	}
	// an attested spr-networks image resolves to its verified digest
	digest, err := verifyImage("ghcr.io/spr-networks/pfw_extension_pfw:latest")
	if err != nil || !strings.HasPrefix(digest, "sha256:") {
		t.Fatalf("pfw: %q %v", digest, err)
	}
	// an image under an attested name without an attestation is refused
	if _, err := verifyImage("ghcr.io/spr-networks/spr-no-such-plugin:latest"); err == nil {
		t.Fatal("verified a missing image")
	}
}
