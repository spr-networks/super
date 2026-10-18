#!/bin/bash
# Download the latest Pi 5 kernel and matching Pi 4 kernel into $1, verifying
# each .deb against its GitHub build provenance attestation (Sigstore) before it is
# allowed into the image. Bundles are fetched from the public attestations
# API, so no GitHub login is needed.
set -euo pipefail

KERNEL_REPO="spr-networks/spr-debian-kernel"
KERNEL_WORKFLOW="${KERNEL_REPO}/.github/workflows/build-kernel.yml"
DEST=${1:?usage: $0 <dest-dir>}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

curl -fsSL -o "$WORK/latest.json" "https://api.github.com/repos/${KERNEL_REPO}/releases/latest"
TAG=$(jq -er .tag_name "$WORK/latest.json")

fetch_variant() {
  local variant=$1 release_tag=$2 release_json=$3
  local name url deb digest asset
  local -a assets

  if [ -z "$release_json" ]; then
    release_json="$WORK/${variant}.json"
    curl -fsSL -o "$release_json" "https://api.github.com/repos/${KERNEL_REPO}/releases/tags/${release_tag}"
  fi
  if [ "$(jq -er .tag_name "$release_json")" != "$release_tag" ]; then
    echo "unexpected kernel release tag for ${variant}" >&2
    exit 1
  fi
  mapfile -t assets < <(jq -r '.assets[] | select(.name | endswith(".deb")) | "\(.name) \(.browser_download_url)"' "$release_json")
  if [ "${#assets[@]}" -eq 0 ]; then
    echo "no .deb assets in ${KERNEL_REPO} release ${release_tag}" >&2
    exit 1
  fi

  install -m 0755 -d "$WORK/$variant" "$DEST/$variant"
  for asset in "${assets[@]}"; do
    read -r name url <<<"$asset"
    deb="$WORK/$variant/$name"
    curl -fsSL -o "$deb" "$url"
    digest=$(sha256sum "$deb" | cut -d' ' -f1)
    curl -fsSL "https://api.github.com/repos/${KERNEL_REPO}/attestations/sha256:${digest}" |
      jq -c '.attestations[].bundle' > "$deb.bundle.jsonl"
    # Both releases are built by the workflow running from the stable version tag.
    GH_CONFIG_DIR="$WORK/gh" gh attestation verify "$deb" \
      --bundle "$deb.bundle.jsonl" \
      --repo "$KERNEL_REPO" \
      --signer-workflow "$KERNEL_WORKFLOW" \
      --source-ref "refs/tags/${TAG}" >/dev/null
    install -m 0644 "$deb" "$DEST/$variant/"
    echo "verified ${name} (sha256:${digest}) from ${KERNEL_REPO}@${TAG}"
  done
}

fetch_variant 16k "$TAG" "$WORK/latest.json"
fetch_variant 4k "pi4-${TAG}" ""
