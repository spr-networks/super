#!/bin/bash
# Download the latest spr-debian-kernel release into $1, verifying each .deb
# against its GitHub build provenance attestation (Sigstore) before it is
# allowed into the image. Bundles are fetched from the public attestations
# API, so no GitHub login is needed.
set -euo pipefail

KERNEL_REPO="spr-networks/spr-debian-kernel"
KERNEL_WORKFLOW="${KERNEL_REPO}/.github/workflows/build-kernel.yml"
DEST=${1:?usage: $0 <dest-dir> [pi5|both]}
# Keep the single-kernel layout for the Nix and Pi 5-only image builders.
# The universal Pi image requests both, in separate pi4/ and pi5/ directories.
MODE=${2:-pi5}
case "$MODE" in pi5|both) ;; *) echo "invalid kernel mode: $MODE" >&2; exit 1 ;; esac

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

curl -fsSL -o "$WORK/release.json" "https://api.github.com/repos/${KERNEL_REPO}/releases/latest"
TAG=$(jq -er .tag_name "$WORK/release.json")
if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9]+)?$ ]]; then
  echo "unexpected kernel release tag: $TAG" >&2
  exit 1
fi
VERSION=${TAG#v}
VERSION=${VERSION%%-*}

fetch_release() {
  local release=$1 kver=$2 json=$3 dir=$4 name url deb digest
  local -a assets images headers libc
  test "$(jq -er .tag_name "$json")" = "$release"
  mapfile -t images < <(jq -r --arg p "linux-image-${kver}_" '.assets[] | select(.name | startswith($p) and endswith("_arm64.deb")) | .name' "$json")
  mapfile -t headers < <(jq -r --arg p "linux-headers-${kver}_" '.assets[] | select(.name | startswith($p) and endswith("_arm64.deb")) | .name' "$json")
  mapfile -t libc < <(jq -r '.assets[] | select(.name | startswith("linux-libc-dev_") and endswith("_arm64.deb")) | .name' "$json")
  if [ "${#images[@]}" -ne 1 ] || [ "${#headers[@]}" -ne 1 ] || [ "${#libc[@]}" -ne 1 ]; then
    echo "expected one image, headers and libc package for ${kver} in ${release}" >&2
    exit 1
  fi
  assets=("${images[0]}" "${headers[0]}" "${libc[0]}")
  mkdir -p "$dir"
  for name in "${assets[@]}"; do
    [[ "$name" =~ ^[a-zA-Z0-9._+~-]+$ ]] || exit 1
    url=$(jq -er --arg n "$name" '.assets[] | select(.name == $n) | .browser_download_url' "$json")
    deb="$dir/$name"
    curl -fsSL -o "$deb" "$url"
    digest=$(sha256sum "$deb" | cut -d' ' -f1)
    curl -fsSL "https://api.github.com/repos/${KERNEL_REPO}/attestations/sha256:${digest}" |
      jq -c '.attestations[].bundle' > "$deb.bundle.jsonl"
    # Both flavours are built by the v* tag run. The pi4-v* release is only
    # a publication destination, NOT the source ref in its attestations.
    GH_CONFIG_DIR="$WORK/gh" gh attestation verify "$deb" \
      --bundle "$deb.bundle.jsonl" \
      --repo "$KERNEL_REPO" \
      --signer-workflow "$KERNEL_WORKFLOW" \
      --source-ref "refs/tags/${TAG}" >/dev/null
    echo "verified ${name} (sha256:${digest}) from ${KERNEL_REPO}@${TAG}"
  done
}

fetch_release "$TAG" "${VERSION}-v8-16k+" "$WORK/release.json" "$WORK/pi5"
if [ "$MODE" = both ]; then
  # Never fall back to an older Pi 4 build or silently ship only Pi 5.
  curl -fsSL -o "$WORK/pi4.json" "https://api.github.com/repos/${KERNEL_REPO}/releases/tags/pi4-${TAG}"
  fetch_release "pi4-${TAG}" "${VERSION}-v8+" "$WORK/pi4.json" "$WORK/pi4"
  install -m 0755 -d "$DEST/pi4" "$DEST/pi5"
  install -m 0644 "$WORK/pi4"/*.deb "$DEST/pi4/"
  install -m 0644 "$WORK/pi5"/*.deb "$DEST/pi5/"
else
  install -m 0755 -d "$DEST"
  install -m 0644 "$WORK/pi5"/*.deb "$DEST/"
fi
