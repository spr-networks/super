# SPR libkrun host runtime

This directory builds the `spr-krun-runtime` arm64 Debian package used by
KVM-isolated SPR plugins.

The package contains:

- libkrun 1.19.4 with reliable external DHCP behavior
- libkrunfw 5.5.0 (Linux 6.12.91)
- crun 1.28 with direct TAP and Unix-socket/virtio-vsock support
- `spr-krun-runtime-configure`, which merges the `spr-krun` runtime into
  Docker's existing `daemon.json` and reloads Docker without restarting it

Plugin compose files select it with `runtime: spr-krun`.

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

