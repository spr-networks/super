#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=versions.env
. "$SCRIPT_DIR/versions.env"

OUTPUT_DIR="${1:-$SCRIPT_DIR/dist}"
SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"
BUILD_DIR="$(mktemp -d /tmp/spr-krun-runtime.XXXXXX)"
trap 'rm -rf "$BUILD_DIR"' EXIT

if [ "$(dpkg --print-architecture)" != "arm64" ]; then
    echo "spr-krun-runtime currently builds only for Debian arm64" >&2
    exit 1
fi

download() {
    local url="$1"
    local output="$2"
    local sha256="$3"

    curl --fail --location --show-error --output "$output" "$url"
    printf '%s  %s\n' "$sha256" "$output" | sha256sum --check -
}

mkdir -p "$OUTPUT_DIR"
cd "$BUILD_DIR"

download \
    "https://github.com/containers/libkrun/archive/${LIBKRUN_COMMIT}.tar.gz" \
    libkrun.tar.gz \
    "$LIBKRUN_SHA256"
download \
    "https://github.com/libkrun/libkrunfw/archive/${LIBKRUNFW_COMMIT}.tar.gz" \
    libkrunfw.tar.gz \
    "$LIBKRUNFW_SOURCE_SHA256"
download \
    "https://github.com/containers/crun/releases/download/${CRUN_VERSION}/crun-${CRUN_VERSION}.tar.gz" \
    "crun-${CRUN_VERSION}.tar.gz" \
    "$CRUN_SHA256"
download \
    "https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/aarch64-unknown-linux-gnu/rustup-init" \
    rustup-init \
    "$RUSTUP_SHA256"
download \
    "https://raw.githubusercontent.com/spr-networks/spr-debian-kernel/${SPR_KERNEL_CONFIG_COMMIT}/spr.config" \
    spr.config \
    "$SPR_KERNEL_CONFIG_SHA256"

awk '
    /^# .*BPF/ { network = 1 }
    /^# .*Firmware loader/ { network = 0 }
    network && /^CONFIG_/ {
        sub(/=m$/, "=y")
        print
    }
    /^# .*Misc/ { misc = 1; next }
    /^# .*Disable unused/ { misc = 0 }
    misc && /^CONFIG_(DUMMY|NET_UDP_TUNNEL|WIREGUARD)=/ {
        sub(/=m$/, "=y")
        print
    }
' spr.config > spr-network.config

tar -xzf libkrun.tar.gz
tar -xzf libkrunfw.tar.gz
tar -xzf "crun-${CRUN_VERSION}.tar.gz"

LIBKRUN_DIR="$BUILD_DIR/libkrun-${LIBKRUN_COMMIT}"
LIBKRUNFW_DIR="$BUILD_DIR/libkrunfw-${LIBKRUNFW_COMMIT}"
CRUN_DIR="$BUILD_DIR/crun-${CRUN_VERSION}"
SDK_DIR="$BUILD_DIR/sdk"
FW_SDK_DIR="$BUILD_DIR/fw-sdk"
KERNEL_UAPI_DIR="$BUILD_DIR/kernel-uapi"
PACKAGE_ROOT="$BUILD_DIR/package"
PRIVATE_LIBDIR="$PACKAGE_ROOT/usr/lib/spr-krun-runtime"

mkdir -p "$LIBKRUNFW_DIR/tarballs"
download \
    "https://cdn.kernel.org/pub/linux/kernel/v6.x/${LIBKRUNFW_KERNEL_VERSION}.tar.xz" \
    "$LIBKRUNFW_DIR/tarballs/${LIBKRUNFW_KERNEL_VERSION}.tar.xz" \
    "$LIBKRUNFW_KERNEL_SHA256"

tar -C "$LIBKRUNFW_DIR" -xf \
    "$LIBKRUNFW_DIR/tarballs/${LIBKRUNFW_KERNEL_VERSION}.tar.xz"
while IFS= read -r kernel_patch; do
    patch -p1 -d "$LIBKRUNFW_DIR/$LIBKRUNFW_KERNEL_VERSION" \
        < "$kernel_patch"
done < <(find "$LIBKRUNFW_DIR/patches" -name '0*.patch' | sort)
make -C "$LIBKRUNFW_DIR/$LIBKRUNFW_KERNEL_VERSION" \
    ARCH=arm64 \
    INSTALL_HDR_PATH="$KERNEL_UAPI_DIR" \
    headers_install
printf '#include <sys/syscall.h>\n' | \
    cc -I"$KERNEL_UAPI_DIR/include" -dM -E - | \
    grep '^#define __NR_mount_setattr ' >/dev/null
cp "$LIBKRUNFW_DIR/config-libkrunfw_aarch64" \
    "$LIBKRUNFW_DIR/$LIBKRUNFW_KERNEL_VERSION/.config"
make -C "$LIBKRUNFW_DIR/$LIBKRUNFW_KERNEL_VERSION" olddefconfig
(
    cd "$LIBKRUNFW_DIR/$LIBKRUNFW_KERNEL_VERSION"
    scripts/kconfig/merge_config.sh -m .config \
        "$BUILD_DIR/spr-network.config" \
        "$SCRIPT_DIR/kernel-net.config"
    make olddefconfig
    for option in \
        CONFIG_IP_ADVANCED_ROUTER \
        CONFIG_IP_MULTIPLE_TABLES \
        CONFIG_IPV6_MULTIPLE_TABLES \
        CONFIG_BRIDGE_NETFILTER \
        CONFIG_IP_SET \
        CONFIG_NET_SCHED \
        CONFIG_NFT_COMPAT \
        CONFIG_NFT_MASQ \
        CONFIG_NFT_NAT \
        CONFIG_NETFILTER_XTABLES \
        CONFIG_NETFILTER_XT_TARGET_MARK \
        CONFIG_NETFILTER_XT_TARGET_MASQUERADE \
        CONFIG_NETFILTER_XT_TARGET_TPROXY \
        CONFIG_NETFILTER_XT_MATCH_SOCKET \
        CONFIG_IP_NF_IPTABLES \
        CONFIG_IP6_NF_IPTABLES \
        CONFIG_WIREGUARD; do
        grep -qx "$option=y" .config
    done
)
(
    cd "$LIBKRUNFW_DIR"
    make -j"${MAKE_JOBS:-$(nproc)}"
    make PREFIX=/usr/local DESTDIR="$FW_SDK_DIR" install
)

git -C "$LIBKRUN_DIR" apply --check \
    "$SCRIPT_DIR/patches/libkrun/0001-reliable-external-dhcp.patch"
git -C "$LIBKRUN_DIR" apply \
    "$SCRIPT_DIR/patches/libkrun/0001-reliable-external-dhcp.patch"

chmod 0755 rustup-init
export RUSTUP_HOME="$BUILD_DIR/rustup"
export CARGO_HOME="$BUILD_DIR/cargo"
./rustup-init -y --no-modify-path --profile minimal --default-toolchain "$RUST_VERSION"
export PATH="$CARGO_HOME/bin:$PATH"
export RUSTUP_TOOLCHAIN="$RUST_VERSION"
make -C "$LIBKRUN_DIR" -j"${MAKE_JOBS:-$(nproc)}" NET=1 PREFIX=/usr/local
make -C "$LIBKRUN_DIR" NET=1 PREFIX=/usr/local DESTDIR="$SDK_DIR" install

git -C "$CRUN_DIR" apply --check \
    "$SCRIPT_DIR/patches/crun/0001-vsock-unix-and-disable-passt-ingress.patch"
git -C "$CRUN_DIR" apply \
    "$SCRIPT_DIR/patches/crun/0001-vsock-unix-and-disable-passt-ingress.patch"
git -C "$CRUN_DIR" apply --check \
    "$SCRIPT_DIR/patches/crun/0002-direct-spr-tap.patch"
git -C "$CRUN_DIR" apply \
    "$SCRIPT_DIR/patches/crun/0002-direct-spr-tap.patch"
git -C "$CRUN_DIR" apply --check \
    "$SCRIPT_DIR/patches/crun/0003-private-plugin-network.patch"
git -C "$CRUN_DIR" apply \
    "$SCRIPT_DIR/patches/crun/0003-private-plugin-network.patch"
git -C "$CRUN_DIR" apply --check \
    "$SCRIPT_DIR/patches/crun/0004-host-unix-vsock-connect.patch"
git -C "$CRUN_DIR" apply \
    "$SCRIPT_DIR/patches/crun/0004-host-unix-vsock-connect.patch"

(
    cd "$CRUN_DIR"
    PKG_CONFIG_PATH="$SDK_DIR/usr/local/lib64/pkgconfig" \
    CPPFLAGS="-I$KERNEL_UAPI_DIR/include -I$SDK_DIR/usr/local/include" \
    LDFLAGS="-L$SDK_DIR/usr/local/lib64 -Wl,-rpath-link,$SDK_DIR/usr/local/lib64" \
        ./configure --prefix=/usr --with-libkrun
    make -j"${MAKE_JOBS:-$(nproc)}"
)

install -d -m 0755 \
    "$PACKAGE_ROOT/DEBIAN" \
    "$PACKAGE_ROOT/usr/libexec/spr-krun-runtime" \
    "$PRIVATE_LIBDIR" \
    "$PACKAGE_ROOT/usr/sbin" \
    "$PACKAGE_ROOT/usr/share/doc/spr-krun-runtime"

install -m 0755 "$CRUN_DIR/crun" \
    "$PACKAGE_ROOT/usr/libexec/spr-krun-runtime/krun"
cp -a "$SDK_DIR/usr/local/lib64"/libkrun.so* "$PRIVATE_LIBDIR/"
cp -a "$FW_SDK_DIR/usr/local/lib64"/libkrunfw.so* "$PRIVATE_LIBDIR/"

nm -D --defined-only "$PRIVATE_LIBDIR/libkrun.so.${LIBKRUN_VERSION}" |
    grep ' krun_add_net_tap$' >/dev/null
nm -D --defined-only "$PRIVATE_LIBDIR/libkrun.so.${LIBKRUN_VERSION}" |
    grep ' krun_add_vsock_port2$' >/dev/null
strings "$PACKAGE_ROOT/usr/libexec/spr-krun-runtime/krun" |
    grep 'krun.tap_name' >/dev/null
strings "$PACKAGE_ROOT/usr/libexec/spr-krun-runtime/krun" |
    grep 'krun.net_uplink' >/dev/null
strings "$PACKAGE_ROOT/usr/libexec/spr-krun-runtime/krun" |
    grep 'krun.vsock_path' >/dev/null
strings "$PACKAGE_ROOT/usr/libexec/spr-krun-runtime/krun" |
    grep 'krun.vsock_connect_path' >/dev/null

strip --strip-unneeded "$PACKAGE_ROOT/usr/libexec/spr-krun-runtime/krun"
strip --strip-unneeded "$PRIVATE_LIBDIR/libkrun.so.${LIBKRUN_VERSION}"
patchelf --set-rpath '$ORIGIN/../../lib/spr-krun-runtime' \
    "$PACKAGE_ROOT/usr/libexec/spr-krun-runtime/krun"
patchelf --set-rpath '$ORIGIN' \
    "$PRIVATE_LIBDIR/libkrun.so.${LIBKRUN_VERSION}"

install -m 0755 "$SCRIPT_DIR/scripts/spr-krun-runtime-configure" \
    "$PACKAGE_ROOT/usr/sbin/spr-krun-runtime-configure"
install -m 0644 "$SCRIPT_DIR/README.md" \
    "$PACKAGE_ROOT/usr/share/doc/spr-krun-runtime/README.md"
install -m 0644 "$SCRIPT_DIR/versions.env" \
    "$PACKAGE_ROOT/usr/share/doc/spr-krun-runtime/versions.env"
install -m 0644 "$SCRIPT_DIR/debian/copyright" \
    "$PACKAGE_ROOT/usr/share/doc/spr-krun-runtime/copyright"
install -m 0644 "$SCRIPT_DIR/patches/crun/COPYING" \
    "$PACKAGE_ROOT/usr/share/doc/spr-krun-runtime/COPYING.crun"
install -m 0644 "$SCRIPT_DIR/patches/libkrun/COPYING" \
    "$PACKAGE_ROOT/usr/share/doc/spr-krun-runtime/COPYING.libkrun"
install -m 0755 "$SCRIPT_DIR/debian/postinst" "$PACKAGE_ROOT/DEBIAN/postinst"
install -m 0755 "$SCRIPT_DIR/debian/prerm" "$PACKAGE_ROOT/DEBIAN/prerm"

sed "s/@VERSION@/${SPR_KRUN_PACKAGE_VERSION}/" \
    "$SCRIPT_DIR/debian/control.in" > "$PACKAGE_ROOT/DEBIAN/control"
printf 'Installed-Size: %s\n' "$(du -sk "$PACKAGE_ROOT/usr" | cut -f1)" \
    >> "$PACKAGE_ROOT/DEBIAN/control"

find "$PACKAGE_ROOT" -print0 |
    xargs -0 touch -h -d "@${SOURCE_DATE_EPOCH}"

DEB_NAME="spr-krun-runtime_${SPR_KRUN_PACKAGE_VERSION}_arm64.deb"
dpkg-deb --root-owner-group --build "$PACKAGE_ROOT" "$OUTPUT_DIR/$DEB_NAME"
(
    cd "$OUTPUT_DIR"
    sha256sum "$DEB_NAME" > "${DEB_NAME}.sha256"
)

echo "Built $OUTPUT_DIR/$DEB_NAME"
