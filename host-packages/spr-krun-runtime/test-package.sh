#!/bin/bash
set -euo pipefail

DEB="${1:-}"
if [ -z "$DEB" ] || [ ! -f "$DEB" ]; then
    echo "usage: $0 path/to/spr-krun-runtime_arm64.deb" >&2
    exit 2
fi

DEB_DIR="$(cd -- "$(dirname -- "$DEB")" && pwd)"
DEB_NAME="$(basename -- "$DEB")"
BUILD_CONTEXT="$(mktemp -d)"
TEST_IMAGES=()

cleanup() {
    if [ "${#TEST_IMAGES[@]}" -gt 0 ]; then
        docker image rm --force "${TEST_IMAGES[@]}" >/dev/null 2>&1 || true
    fi
    rm -rf -- "$BUILD_CONTEXT"
}
trap cleanup EXIT

cp -- "$DEB_DIR/$DEB_NAME" "$BUILD_CONTEXT/spr-krun-runtime.deb"

KRUN_RUN_OPTIONS=(--platform linux/arm64)
case "$(docker version --format '{{.Server.Arch}}')" in
    arm64|aarch64)
        ;;
    *)
        # crun protects against runtime binary replacement by re-executing
        # itself from a sealed file descriptor. Cross-architecture emulators
        # cannot reliably perform that fexecve, while a read-only root lets
        # crun use its supported immutable-binary path.
        KRUN_RUN_OPTIONS+=(--read-only)
        ;;
esac

for image in debian:bullseye debian:trixie; do
    release="${image#debian:}"
    test_image="spr-krun-package-test:${release}-$$"
    TEST_IMAGES+=("$test_image")

    docker buildx build \
        --load \
        --platform linux/arm64 \
        --build-arg "BASE_IMAGE=$image" \
        --tag "$test_image" \
        --file - \
        "$BUILD_CONTEXT" <<'EOF'
ARG BASE_IMAGE=debian:bullseye
FROM ${BASE_IMAGE}

ENV DEBIAN_FRONTEND=noninteractive

COPY spr-krun-runtime.deb /packages/spr-krun-runtime.deb

RUN apt-get update \
    && mkdir -p /etc/docker \
    && printf '%s\n' \
        '{"iptables":false,"runtimes":{"runsc":{"path":"/usr/local/bin/runsc","runtimeArgs":["--host-uds=all","--platform=kvm"]}}}' \
        > /etc/docker/daemon.json \
    && apt-get install -y --download-only --no-install-recommends \
        /packages/spr-krun-runtime.deb \
    && dpkg --unpack /packages/spr-krun-runtime.deb \
    && apt-get install -y --fix-broken --no-download --no-install-recommends
EOF

    docker run --rm "${KRUN_RUN_OPTIONS[@]}" \
        "$test_image" sh -euxc '
            /usr/libexec/spr-krun-runtime/krun --version |
                grep -F "+LIBKRUN"
        '

    docker run --rm --platform linux/arm64 \
        "$test_image" sh -euxc '
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

            daemon_inode=$(stat -c %i /etc/docker/daemon.json)
            spr-krun-runtime-configure --no-reload
            test "$(stat -c %i /etc/docker/daemon.json)" = "$daemon_inode"
            apt-get remove -y spr-krun-runtime
            jq -e \
                ".iptables == false and
                 .runtimes.runsc.path == \"/usr/local/bin/runsc\" and
                 (.runtimes | keys == [\"runsc\"])" \
                /etc/docker/daemon.json
        '
done
