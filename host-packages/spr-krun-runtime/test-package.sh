#!/bin/bash
set -euo pipefail

DEB="${1:-}"
if [ -z "$DEB" ] || [ ! -f "$DEB" ]; then
    echo "usage: $0 path/to/spr-krun-runtime_arm64.deb" >&2
    exit 2
fi

DEB_DIR="$(cd -- "$(dirname -- "$DEB")" && pwd)"
DEB_NAME="$(basename -- "$DEB")"

for image in debian:bullseye debian:trixie; do
    docker run --rm --platform linux/arm64 \
        -v "$DEB_DIR:/packages:ro" \
        "$image" sh -euxc '
            export DEBIAN_FRONTEND=noninteractive
            apt-get update
            mkdir -p /etc/docker
            printf "%s\n" \
                "{\"iptables\":false,\"runtimes\":{\"runsc\":{\"path\":\"/usr/local/bin/runsc\",\"runtimeArgs\":[\"--host-uds=all\",\"--platform=kvm\"]}}}" \
                > /etc/docker/daemon.json
            apt-get install -y --download-only --no-install-recommends "/packages/$1"
            dpkg --unpack "/packages/$1"
            apt-get install -y --fix-broken --no-download --no-install-recommends

            /usr/libexec/spr-krun-runtime/krun --version |
                grep -F "+LIBKRUN"
            test "$(stat -c "%U:%G %a" /run/spr-krun)" = "root:root 755"
            test "$(stat -c "%U:%G %a" /run/spr-krun/connect)" = "root:root 755"
            test "$(stat -c "%U:%G %a" /run/spr-krun/listen)" = "root:root 755"
            test "$(stat -c "%U:%G %a" /var/lib/spr-krun)" = "root:root 700"
            test "$(stat -c "%U:%G %a" /var/lib/spr-krun/policies)" = "root:root 700"
            test "$(stat -c "%U:%G %a" /var/lib/spr-krun/overrides)" = "root:root 700"
            test -f /usr/lib/tmpfiles.d/spr-krun-runtime.conf
            grep -aqF "/run/spr-krun/connect" \
                /usr/libexec/spr-krun-runtime/krun
            grep -aqF "/run/spr-krun/listen" \
                /usr/libexec/spr-krun-runtime/krun
            grep -aqF "/var/lib/spr-krun/policies" \
                /usr/libexec/spr-krun-runtime/krun
            grep -aqF "run.oci.spr.krun.policy" \
                /usr/libexec/spr-krun-runtime/krun
            grep -aqF "krun_set_rlimits" \
                /usr/libexec/spr-krun-runtime/krun
            grep -aqF "RLIMIT_NOFILE" \
                /usr/libexec/spr-krun-runtime/krun
            ! grep -aEq \
                "krun[.](tap_name|net_uplink|net_mac|vsock_path|vsock_connect_path)" \
                /usr/libexec/spr-krun-runtime/krun
            jq -e \
                ".iptables == false and
                 .runtimes.runsc.path == \"/usr/local/bin/runsc\" and
                 .runtimes.runsc.runtimeArgs[1] == \"--platform=kvm\" and
                 .runtimes[\"spr-krun\"].path == \"/usr/libexec/spr-krun-runtime/krun\" and
                 (.runtimes | keys == [\"runsc\", \"spr-krun\"])" \
                /etc/docker/daemon.json

            spr-krun-runtime-configure --no-reload
            apt-get remove -y spr-krun-runtime
            jq -e \
                ".iptables == false and
                 .runtimes.runsc.path == \"/usr/local/bin/runsc\" and
                 (.runtimes | keys == [\"runsc\"])" \
                /etc/docker/daemon.json
        ' sh "$DEB_NAME"
done
