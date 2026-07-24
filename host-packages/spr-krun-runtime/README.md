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

## Design goals

Unix/vsock endpoints are restricted as follows:

- superd reads the plugin Compose file to mount a socket directory for RPC
- Nested paths and paths outside the approved directories are rejected.
- All path components are checked without following symlinks.
- TAP names and MAC addresses are managed
- Privileged krun.* image annotations are ignored.
- Both create/start and direct run configure networking before releasing the plugin.
- The runtime requires exactly one veth uplink.

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
