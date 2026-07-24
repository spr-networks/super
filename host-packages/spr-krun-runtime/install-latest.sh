#!/bin/bash
# Install or upgrade the latest released SPR KVM runtime package.
set -euo pipefail

REPOSITORY="${SPR_KRUN_RELEASE_REPOSITORY:-spr-networks/super}"
BUILD_DIR="$(mktemp -d /tmp/spr-krun-install.XXXXXX)"
trap 'rm -rf "$BUILD_DIR"' EXIT

if [ "$(uname -m)" != "aarch64" ]; then
    echo "spr-krun-runtime release packages currently support aarch64 only" >&2
    exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
    exec sudo -- "$0" "$@"
fi

release_json="$BUILD_DIR/release.json"
curl --fail --location --show-error \
    --output "$release_json" \
    "https://api.github.com/repos/${REPOSITORY}/releases/latest"

deb_url="$(jq -r '
    .assets[] |
    select(.name | test("^spr-krun-runtime_.+_arm64[.]deb$")) |
    .browser_download_url
' "$release_json" | head -n1)"
sha_url="$(jq -r '
    .assets[] |
    select(.name | test("^spr-krun-runtime_.+_arm64[.]deb[.]sha256$")) |
    .browser_download_url
' "$release_json" | head -n1)"

if [ -z "$deb_url" ] || [ "$deb_url" = null ] ||
   [ -z "$sha_url" ] || [ "$sha_url" = null ]; then
    echo "latest ${REPOSITORY} release has no spr-krun-runtime arm64 package" >&2
    exit 1
fi

deb="$BUILD_DIR/${deb_url##*/}"
sha="$BUILD_DIR/${sha_url##*/}"
curl --fail --location --show-error --output "$deb" "$deb_url"
curl --fail --location --show-error --output "$sha" "$sha_url"
(
    cd "$BUILD_DIR"
    sha256sum --check "${sha##*/}"
)

apt-get install -y "$deb"
