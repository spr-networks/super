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
