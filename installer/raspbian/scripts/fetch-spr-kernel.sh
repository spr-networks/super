#!/bin/bash
# Download the latest spr-debian-kernel release into $1, verifying each .deb
# against its GitHub build provenance attestation (Sigstore) before it is
# allowed into the image. Bundles are fetched from the public attestations
# API, so no GitHub login is needed.
set -euo pipefail

KERNEL_REPO="spr-networks/spr-debian-kernel"
KERNEL_WORKFLOW="${KERNEL_REPO}/.github/workflows/build-kernel.yml"
DEST=${1:?usage: $0 <dest-dir>}

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

curl -fsSL -o "$WORK/release.json" "https://api.github.com/repos/${KERNEL_REPO}/releases/latest"
TAG=$(jq -r .tag_name "$WORK/release.json")
mapfile -t ASSETS < <(jq -r '.assets[] | select(.name | endswith(".deb")) | "\(.name) \(.browser_download_url)"' "$WORK/release.json")
if [ "${#ASSETS[@]}" -eq 0 ]; then
  echo "no .deb assets in ${KERNEL_REPO} release ${TAG}" >&2
  exit 1
fi

for asset in "${ASSETS[@]}"; do
  read -r name url <<<"$asset"
  deb="$WORK/$name"
  curl -fsSL -o "$deb" "$url"
  digest=$(sha256sum "$deb" | cut -d' ' -f1)
  curl -fsSL "https://api.github.com/repos/${KERNEL_REPO}/attestations/sha256:${digest}" |
    jq -c '.attestations[].bundle' > "$deb.bundle.jsonl"
  # Must be built by the kernel repo's release workflow from this release tag.
  GH_CONFIG_DIR="$WORK/gh" gh attestation verify "$deb" \
    --bundle "$deb.bundle.jsonl" \
    --repo "$KERNEL_REPO" \
    --signer-workflow "$KERNEL_WORKFLOW" \
    --source-ref "refs/tags/${TAG}" >/dev/null
  echo "verified ${name} (sha256:${digest}) from ${KERNEL_REPO}@${TAG}"
done

install -m 0755 -d "$DEST"
install -m 0644 "$WORK"/*.deb "$DEST"/
