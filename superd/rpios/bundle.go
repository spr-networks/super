package main

// The OCI runtime spec of a plugin container, from its image config and
// compose service, with Docker's defaults: its capabilities, mounts and
// masked paths, everything for privileged services.

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/compose-spec/compose-go/v2/types"
	specs "github.com/opencontainers/runtime-spec/specs-go"
	"golang.org/x/sys/unix"
)

// a static init for `init: true` services, mounted as Docker's docker-init
var InitPath = os.Getenv("SPR_INIT")

// Docker's defaults but CAP_MKNOD: Docker's device cgroup keeps a node made
// with it from being opened, and crun runs here without cgroups, so a
// container could otherwise open the host's disks. cap_add can still grant it.
var dockerDefaultCaps = []string{
	"CAP_CHOWN", "CAP_DAC_OVERRIDE", "CAP_FSETID", "CAP_FOWNER",
	"CAP_NET_RAW", "CAP_SETGID", "CAP_SETUID", "CAP_SETFCAP", "CAP_SETPCAP",
	"CAP_NET_BIND_SERVICE", "CAP_SYS_CHROOT", "CAP_KILL", "CAP_AUDIT_WRITE",
}

var allCaps = []string{
	"CAP_CHOWN", "CAP_DAC_OVERRIDE", "CAP_DAC_READ_SEARCH", "CAP_FOWNER", "CAP_FSETID",
	"CAP_KILL", "CAP_SETGID", "CAP_SETUID", "CAP_SETPCAP", "CAP_LINUX_IMMUTABLE",
	"CAP_NET_BIND_SERVICE", "CAP_NET_BROADCAST", "CAP_NET_ADMIN", "CAP_NET_RAW",
	"CAP_IPC_LOCK", "CAP_IPC_OWNER", "CAP_SYS_MODULE", "CAP_SYS_RAWIO", "CAP_SYS_CHROOT",
	"CAP_SYS_PTRACE", "CAP_SYS_PACCT", "CAP_SYS_ADMIN", "CAP_SYS_BOOT", "CAP_SYS_NICE",
	"CAP_SYS_RESOURCE", "CAP_SYS_TIME", "CAP_SYS_TTY_CONFIG", "CAP_MKNOD", "CAP_LEASE",
	"CAP_AUDIT_WRITE", "CAP_AUDIT_CONTROL", "CAP_SETFCAP", "CAP_MAC_OVERRIDE",
	"CAP_MAC_ADMIN", "CAP_SYSLOG", "CAP_WAKE_ALARM", "CAP_BLOCK_SUSPEND", "CAP_AUDIT_READ",
	"CAP_PERFMON", "CAP_BPF", "CAP_CHECKPOINT_RESTORE",
}

var dockerMaskedPaths = []string{
	"/proc/asound", "/proc/acpi", "/proc/interrupts", "/proc/kcore", "/proc/keys",
	"/proc/latency_stats", "/proc/timer_list", "/proc/timer_stats", "/proc/sched_debug",
	"/proc/scsi", "/sys/firmware", "/sys/devices/virtual/powercap",
}

var dockerReadonlyPaths = []string{
	"/proc/bus", "/proc/fs", "/proc/irq", "/proc/sys", "/proc/sysrq-trigger",
}

func capName(c string) string {
	c = strings.ToUpper(c)
	if !strings.HasPrefix(c, "CAP_") {
		c = "CAP_" + c
	}
	return c
}

func capabilities(svc types.ServiceConfig) []string {
	if svc.Privileged {
		return allCaps
	}
	set := map[string]bool{}
	for _, c := range dockerDefaultCaps {
		set[c] = true
	}
	for _, c := range svc.CapAdd {
		if strings.EqualFold(c, "ALL") {
			for _, a := range allCaps {
				set[a] = true
			}
		} else {
			set[capName(c)] = true
		}
	}
	for _, c := range svc.CapDrop {
		if strings.EqualFold(c, "ALL") {
			set = map[string]bool{}
		} else {
			delete(set, capName(c))
		}
	}
	caps := []string{}
	for c := range set {
		caps = append(caps, c)
	}
	sort.Strings(caps)
	return caps
}

var rlimitNames = map[string]string{
	"core": "RLIMIT_CORE", "cpu": "RLIMIT_CPU", "data": "RLIMIT_DATA", "fsize": "RLIMIT_FSIZE",
	"locks": "RLIMIT_LOCKS", "memlock": "RLIMIT_MEMLOCK", "msgqueue": "RLIMIT_MSGQUEUE",
	"nice": "RLIMIT_NICE", "nofile": "RLIMIT_NOFILE", "nproc": "RLIMIT_NPROC", "rss": "RLIMIT_RSS",
	"rtprio": "RLIMIT_RTPRIO", "rttime": "RLIMIT_RTTIME", "sigpending": "RLIMIT_SIGPENDING",
	"stack": "RLIMIT_STACK", "as": "RLIMIT_AS",
}

func rlimits(svc types.ServiceConfig) ([]specs.POSIXRlimit, error) {
	// Docker's daemon default
	limits := map[string]specs.POSIXRlimit{
		"RLIMIT_NOFILE": {Type: "RLIMIT_NOFILE", Soft: 1048576, Hard: 1048576},
	}
	for name, u := range svc.Ulimits {
		t, ok := rlimitNames[name]
		if !ok {
			return nil, fmt.Errorf("unsupported ulimit %q", name)
		}
		soft, hard := u.Soft, u.Hard
		if u.Single != 0 {
			soft, hard = u.Single, u.Single
		}
		limits[t] = specs.POSIXRlimit{Type: t, Soft: uint64(soft), Hard: uint64(hard)}
	}
	list := []specs.POSIXRlimit{}
	for _, l := range limits {
		list = append(list, l)
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Type < list[j].Type })
	return list, nil
}

// lookupUser resolves a compose/image user ("name", "uid", "uid:gid") in
// the image's /etc/passwd and /etc/group.
func lookupUser(rootfs, user string) (specs.User, error) {
	if user == "" {
		return specs.User{}, nil
	}
	userPart, groupPart, hasGroup := strings.Cut(user, ":")
	u := specs.User{}
	if uid, err := strconv.Atoi(userPart); err == nil {
		u.UID = uint32(uid)
		if entry, ok := findEntry(filepath.Join(rootfs, "etc/passwd"), 2, userPart); ok {
			if gid, err := strconv.Atoi(entry[3]); err == nil {
				u.GID = uint32(gid)
			}
		}
	} else {
		entry, ok := findEntry(filepath.Join(rootfs, "etc/passwd"), 0, userPart)
		if !ok {
			return u, fmt.Errorf("user %q not found in the image", userPart)
		}
		uid, _ := strconv.Atoi(entry[2])
		gid, _ := strconv.Atoi(entry[3])
		u.UID, u.GID = uint32(uid), uint32(gid)
	}
	if hasGroup {
		if gid, err := strconv.Atoi(groupPart); err == nil {
			u.GID = uint32(gid)
		} else {
			entry, ok := findEntry(filepath.Join(rootfs, "etc/group"), 0, groupPart)
			if !ok {
				return u, fmt.Errorf("group %q not found in the image", groupPart)
			}
			gid, _ := strconv.Atoi(entry[2])
			u.GID = uint32(gid)
		}
	}
	return u, nil
}

// findEntry finds the colon-separated line of a passwd/group file whose
// field is value. The file is read inside the image root.
func findEntry(path string, field int, value string) ([]string, bool) {
	root, err := os.OpenRoot(filepath.Dir(filepath.Dir(path)))
	if err != nil {
		return nil, false
	}
	defer root.Close()
	f, err := root.Open(filepath.Join(filepath.Base(filepath.Dir(path)), filepath.Base(path)))
	if err != nil {
		return nil, false
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		parts := strings.Split(scanner.Text(), ":")
		if len(parts) > 3 && parts[field] == value {
			return parts, true
		}
	}
	return nil, false
}

func mergeEnv(base []string, svc types.ServiceConfig, hostname string) []string {
	env := map[string]string{}
	order := []string{}
	set := func(k, v string) {
		if _, ok := env[k]; !ok {
			order = append(order, k)
		}
		env[k] = v
	}
	set("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
	set("HOSTNAME", hostname)
	for _, kv := range base {
		k, v, _ := strings.Cut(kv, "=")
		set(k, v)
	}
	keys := []string{}
	for k := range svc.Environment {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, k := range keys {
		if v := svc.Environment[k]; v != nil {
			set(k, *v)
		}
	}
	list := []string{}
	for _, k := range order {
		list = append(list, k+"="+env[k])
	}
	return list
}

// processArgs applies compose entrypoint/command over the image's, as
// Docker: a new entrypoint drops the image's command.
func processArgs(img Image, svc types.ServiceConfig) []string {
	entrypoint := img.Config.Entrypoint
	command := img.Config.Cmd
	if svc.Entrypoint != nil {
		entrypoint = svc.Entrypoint
		command = nil
	}
	if svc.Command != nil {
		command = svc.Command
	}
	return append(append([]string{}, entrypoint...), command...)
}

func bindMount(source, target string, readOnly bool) specs.Mount {
	options := []string{"rbind", "rprivate"}
	if readOnly {
		options = append(options, "ro")
	}
	return specs.Mount{Destination: target, Type: "bind", Source: source, Options: options}
}

func deviceFor(path, target, permissions string) (specs.LinuxDevice, error) {
	var st unix.Stat_t
	if err := unix.Stat(path, &st); err != nil {
		return specs.LinuxDevice{}, err
	}
	kind := ""
	switch st.Mode & unix.S_IFMT {
	case unix.S_IFCHR:
		kind = "c"
	case unix.S_IFBLK:
		kind = "b"
	default:
		return specs.LinuxDevice{}, fmt.Errorf("%s is not a device", path)
	}
	mode := os.FileMode(st.Mode & 0777)
	uid, gid := st.Uid, st.Gid
	return specs.LinuxDevice{
		Path: target, Type: kind,
		Major: int64(unix.Major(uint64(st.Rdev))), Minor: int64(unix.Minor(uint64(st.Rdev))),
		FileMode: &mode, UID: &uid, GID: &gid,
	}, nil
}

// buildSpec writes the runtime spec for container c of service svc.
func buildSpec(c *Container, svc types.ServiceConfig, img Image, socketMounts []string) (*specs.Spec, error) {
	rootfs := img.Rootfs()
	user, err := lookupUser(rootfs, firstNonEmpty(svc.User, img.Config.User))
	if err != nil {
		return nil, err
	}
	limits, err := rlimits(svc)
	if err != nil {
		return nil, err
	}
	args := processArgs(img, svc)
	if len(args) == 0 {
		return nil, fmt.Errorf("service %s has no command", svc.Name)
	}
	initMounts := []specs.Mount{}
	if svc.Init != nil && *svc.Init {
		if InitPath == "" {
			return nil, fmt.Errorf("service %s: init is not available", svc.Name)
		}
		args = append([]string{"/sbin/docker-init", "--"}, args...)
		initMounts = append(initMounts, bindMount(InitPath, "/sbin/docker-init", true))
	}
	noNewPrivileges := false
	for _, opt := range svc.SecurityOpt {
		if opt == "no-new-privileges" || opt == "no-new-privileges:true" || opt == "no-new-privileges=true" {
			noNewPrivileges = true
		}
	}
	caps := capabilities(svc)
	hostNetwork := c.NetworkMode == "host"

	spec := &specs.Spec{
		Version: specs.Version,
		Process: &specs.Process{
			Args: args,
			Env:  mergeEnv(img.Config.Env, svc, c.Hostname),
			Cwd:  firstNonEmpty(svc.WorkingDir, img.Config.WorkingDir, "/"),
			User: user,
			Capabilities: &specs.LinuxCapabilities{
				Bounding: caps, Effective: caps, Permitted: caps,
			},
			Rlimits:         limits,
			NoNewPrivileges: noNewPrivileges,
		},
		Root:        &specs.Root{Path: filepath.Join(c.Dir(), "rootfs"), Readonly: svc.ReadOnly},
		Annotations: map[string]string{},
		Linux: &specs.Linux{
			Sysctl: map[string]string{},
			Namespaces: []specs.LinuxNamespace{
				{Type: specs.PIDNamespace}, {Type: specs.IPCNamespace}, {Type: specs.MountNamespace},
				{Type: specs.CgroupNamespace},
			},
		},
	}
	if !hostNetwork {
		spec.Hostname = c.Hostname
		spec.Linux.Namespaces = append(spec.Linux.Namespaces,
			specs.LinuxNamespace{Type: specs.UTSNamespace},
			specs.LinuxNamespace{Type: specs.NetworkNamespace, Path: filepath.Join("/run/netns", c.ID)})
	}
	if !svc.Privileged {
		spec.Linux.MaskedPaths = dockerMaskedPaths
		spec.Linux.ReadonlyPaths = dockerReadonlyPaths
	}
	for k, v := range svc.Annotations {
		spec.Annotations[k] = v
	}
	for k, v := range c.Annotations {
		spec.Annotations[k] = v
	}
	for k, v := range svc.Sysctls {
		// a host network service would change the host's
		if hostNetwork && strings.HasPrefix(k, "net.") {
			return nil, fmt.Errorf("sysctl %s is not allowed with host networking", k)
		}
		spec.Linux.Sysctl[k] = v
	}

	sysOptions := []string{"nosuid", "noexec", "nodev"}
	if !svc.Privileged {
		sysOptions = append(sysOptions, "ro")
	}
	shmSize := int64(64 << 20)
	if svc.ShmSize > 0 {
		shmSize = int64(svc.ShmSize)
	}
	mounts := []specs.Mount{
		{Destination: "/proc", Type: "proc", Source: "proc", Options: []string{"nosuid", "noexec", "nodev"}},
	}
	if svc.Privileged {
		// all host devices, as Docker gives privileged containers
		mounts = append(mounts, bindMount("/dev", "/dev", false))
	} else {
		mounts = append(mounts, specs.Mount{Destination: "/dev", Type: "tmpfs", Source: "tmpfs",
			Options: []string{"nosuid", "strictatime", "mode=755", "size=65536k"}})
	}
	mounts = append(mounts,
		specs.Mount{Destination: "/dev/pts", Type: "devpts", Source: "devpts",
			Options: []string{"nosuid", "noexec", "newinstance", "ptmxmode=0666", "mode=0620", "gid=5"}},
		specs.Mount{Destination: "/dev/shm", Type: "tmpfs", Source: "shm",
			Options: []string{"nosuid", "noexec", "nodev", "mode=1777", fmt.Sprintf("size=%d", shmSize)}},
		specs.Mount{Destination: "/dev/mqueue", Type: "mqueue", Source: "mqueue",
			Options: []string{"nosuid", "noexec", "nodev"}},
		specs.Mount{Destination: "/sys", Type: "sysfs", Source: "sysfs", Options: sysOptions},
		specs.Mount{Destination: "/sys/fs/cgroup", Type: "cgroup", Source: "cgroup",
			Options: []string{"nosuid", "noexec", "nodev", "relatime", "ro"}},
	)
	// the container's own copies, writable as Docker's are (libkrun's
	// guest init writes resolv.conf from its DHCP lease)
	mounts = append(mounts, bindMount(filepath.Join(c.Dir(), "resolv.conf"), "/etc/resolv.conf", false))
	if !hostNetwork {
		mounts = append(mounts, bindMount(filepath.Join(c.Dir(), "hostname"), "/etc/hostname", false))
	}
	mounts = append(mounts, bindMount(filepath.Join(c.Dir(), "hosts"), "/etc/hosts", false))

	for _, t := range svc.Tmpfs {
		target, options, _ := strings.Cut(t, ":")
		opts := []string{"nosuid", "nodev"}
		if options != "" {
			opts = append(opts, strings.Split(options, ",")...)
		}
		mounts = append(mounts, specs.Mount{Destination: target, Type: "tmpfs", Source: "tmpfs", Options: opts})
	}
	for _, v := range svc.Volumes {
		m, ok, err := volumeMount(c, v)
		if err != nil {
			return nil, err
		}
		if ok {
			mounts = append(mounts, m)
		}
	}
	mounts = append(mounts, initMounts...)
	// the krun policy's sockets: host:guest[:ro]
	for _, s := range socketMounts {
		parts := strings.Split(s, ":")
		mounts = append(mounts, bindMount(parts[0], parts[1], len(parts) > 2 && parts[2] == "ro"))
	}
	spec.Mounts = mounts

	for _, d := range svc.Devices {
		target := firstNonEmpty(d.Target, d.Source)
		if svc.Privileged {
			continue
		}
		dev, err := deviceFor(d.Source, target, d.Permissions)
		if err != nil {
			return nil, fmt.Errorf("device %s: %w", d.Source, err)
		}
		spec.Linux.Devices = append(spec.Linux.Devices, dev)
	}
	return spec, nil
}

// volumeMount maps a compose volume to a mount. Bind sources that don't
// exist are created as directories, as Docker does, except under /etc,
// where Docker hosts have files NixOS doesn't (/etc/timezone).
func volumeMount(c *Container, v types.ServiceVolumeConfig) (specs.Mount, bool, error) {
	switch v.Type {
	case types.VolumeTypeBind:
		v.Source = filepath.Clean(v.Source)
		if _, err := os.Stat(v.Source); os.IsNotExist(err) {
			if strings.HasPrefix(filepath.Clean(v.Source), "/etc/") {
				return specs.Mount{}, false, nil
			}
			if v.Bind != nil && !v.Bind.CreateHostPath {
				return specs.Mount{}, false, fmt.Errorf("bind source %s does not exist", v.Source)
			}
			if err := os.MkdirAll(v.Source, 0755); err != nil {
				return specs.Mount{}, false, err
			}
		}
		return bindMount(v.Source, v.Target, v.ReadOnly), true, nil
	case types.VolumeTypeVolume:
		name := v.Source
		if name == "" {
			name = c.ID + "-" + strings.Trim(strings.ReplaceAll(v.Target, "/", "-"), "-")
		} else {
			name = c.Project + "_" + name
		}
		dir := filepath.Join(PluginRoot, "volumes", name)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return specs.Mount{}, false, err
		}
		return bindMount(dir, v.Target, v.ReadOnly), true, nil
	case types.VolumeTypeTmpfs:
		opts := []string{"nosuid", "nodev"}
		if v.Tmpfs != nil && v.Tmpfs.Size > 0 {
			opts = append(opts, fmt.Sprintf("size=%d", int64(v.Tmpfs.Size)))
		}
		return specs.Mount{Destination: v.Target, Type: "tmpfs", Source: "tmpfs", Options: opts}, true, nil
	}
	return specs.Mount{}, false, fmt.Errorf("unsupported volume type %q for %s", v.Type, v.Target)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
