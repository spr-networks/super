# SPR libkrun host runtime

This directory builds the `spr-krun-runtime` arm64 Debian package used by
KVM-isolated SPR plugins.

The package contains:

- libkrun 1.19.4 with reliable external DHCP behavior
- libkrunfw 5.5.0 (Linux 6.12.91) built with the networking feature set from
  `spr-debian-kernel`, plus guest policy routing
- crun 1.28 with private plugin-network TAP bridging and bidirectional
  Unix-socket/virtio-vsock support, including explicit forwarding of OCI
  process rlimits to the microVM guest
- `spr-krun-runtime-configure`, which merges the `spr-krun` runtime into
  Docker's existing `daemon.json` and reloads Docker without restarting it
  only when the effective configuration changes

Plugin compose files select it with `runtime: spr-krun`.
The packaged OCI runtime is named `krun`, which makes crun select its libkrun
handler before processing Docker's OCI command.

## Design goals

Unix/vsock endpoints are restricted as follows:

- superd accepts a listener only below that plugin's own state directory and
  accepts guest-to-host connectors only from its explicit per-plugin
  allowlist. It bind-mounts the authorized socket's parent into the KVM
  service at `/run/spr-krun/listen/` or `/run/spr-krun/connect/`, so each
  plugin gets a distinct filesystem view. Socket basenames must end in
  `.sock`; suffixless legacy names are rejected rather than rewritten.
- A connect policy names one existing root-owned socket in the plugin's
  read-only `/run/spr-krun/connect/` view. The current manager allowlist grants
  only the Tailscale plugin access to `/state/api/eventbus.sock`.
- A listen policy names one new path in that plugin's
  `/run/spr-krun/listen/` view. The runtime refuses to replace any existing
  filesystem entry. Before libkrun calls `_exit`, its VMM exit observer drops
  the listener. The listener retains a parent directory fd opened one
  component at a time with `O_NOFOLLOW`, plus the original socket identity;
  cleanup rechecks that identity with `fstatat(AT_SYMLINK_NOFOLLOW)` before
  removing the direct child with `unlinkat`.
- Both directories must be root-owned and not writable by group or other;
  nested runtime paths, symlinks, and names outside the two directories are
  rejected.
  Each component under `/run` is opened through a directory file descriptor
  with `O_NOFOLLOW`; the check does not rely on the final component alone.
- TAP names and MAC addresses come from the same root-owned, manager-issued
  policy. The runtime ignores raw privileged `krun.*` image annotations.
- For split `create`/`start`, the fresh start process reloads that policy and
  configures the TAP while the plugin init process is still blocked. Direct
  `run` invokes the same privileged hook before releasing its child.
- Uplink discovery requires exactly one interface whose kernel driver is
  `veth`. This selects Docker's plugin link without allowing the plugin to
  name another interface and ignores kernel-created tunnel placeholders such
  as `gre0` and `gretap0`.
- DHCP accepts CoreDHCP's raw replies from `0.0.0.0:67`, but binds the OFFER
  and ACK to the nonzero DHCP Server Identifier in option 54. A nonzero UDP
  source must match that identifier.

## Building 
Build instructions:

```sh
docker buildx build \
  --platform linux/arm64 \
  --output type=local,dest=dist \
  host-packages/spr-krun-runtime
```

Install or upgrade an existing system:

```sh
sudo apt-get install ./spr-krun-runtime_*_arm64.deb
```

Run the privileged TAP lifecycle regression test against a built package:

```sh
host-packages/spr-krun-runtime/test-tap-lifecycle.sh \
  host-packages/spr-krun-runtime/dist/spr-krun-runtime_*_arm64.deb
```

The test substitutes a minimal fake libkrun backend, then verifies real TAP,
bridge, uplink, address-flush, and ownership state for both `create`/`start`
and direct `run`.
