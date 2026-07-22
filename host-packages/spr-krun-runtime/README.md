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

Plugin compose files select it with `runtime: spr-krun`.
The packaged OCI runtime is named `krun`, which makes crun select its libkrun
handler before processing Docker's OCI command.

## Design goals

Unix/vsock endpoints are restricted as follows:

- A plugin-provided path contributes only its final `.sock` name. superd
  prefixes it with a stable plugin-specific identifier, so two plugins cannot
  select the same entry.
- A connect policy names one existing root-owned socket under
  `/run/spr-krun/connect/`. Placing that exact assigned socket there is the
  host-side authorization to expose the service to that plugin.
- A listen policy names one new path under `/run/spr-krun/listen/`. The runtime
  refuses to replace any existing filesystem entry, and libkrun removes the
  socket after normal shutdown.
- Both directories must be root-owned and not writable by group or other;
  nested paths, symlinks, and names outside the two directories are rejected.
  Each component under `/run` is opened through a directory file descriptor
  with `O_NOFOLLOW`; the check does not rely on the final component alone.
- TAP support for plugin interfaces to network back into host

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
