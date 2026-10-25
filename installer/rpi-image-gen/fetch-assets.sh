#!/usr/bin/env bash
# Fetch what the image is built from into $1, verifying each piece:
#   images/   SPR's service binaries out of the published super_* images,
#             each pulled by the digest its provenance attestation verified
#             (cosign, the identity superd checks), as installer/nixos's
#             fetch-images.sh does
#   krun/     the release's spr-krun-runtime .deb, attested by pi-iso.yml
#   kernel/   the latest spr-debian-kernel release, attestation-verified
#             (installer/raspbian/scripts/fetch-spr-kernel.sh)
#   oxwifid/  barely-ap and barely-cli at reproducible.env's hashes
#   mt76/, mt76-mt7996/  openwrt's mt76 firmware at the raspbian image's commits
#
# The tag is SPR_IMAGE_TAG, else the latest SPR release's. Runs in the
# builder container (Dockerfile) from build-image.sh, at the repo root.
set -euo pipefail
DEST=${1:?usage: $0 <dest-dir>}

TAG=${SPR_IMAGE_TAG:-}
if [ -z "$TAG" ]; then
  TAG=$(curl -fsSL https://api.github.com/repos/spr-networks/super/releases/latest | jq -r .tag_name)
  TAG=${TAG#v}
fi
ARCH=arm64

# <image> <paths in it>: what the spr layer installs from each
IMAGES=(
  "api api sprbus"
  "db boltapi"
  "dhcp coredhcpd coredhcp_client"
  "dns coredns"
  "dyndns dyndns_plugin godns"
  "multicast_udp_proxy code/multicastproxy"
  "packet_logs packet_logs"
  "plugin-lookup lookup_plugin"
  "wireguard wireguard_plugin"
  "wifid usr/local/bin/hostapd usr/local/bin/hostapd_cli hostap_dhcp_helper code/filter_dhcp_mismatch.o"
  "wifiuplink usr/sbin/wpa_supplicant usr/sbin/wpa_cli"
  "ppp usr/sbin/pppd usr/lib/pppd"
  "frontend app/build"
)

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
echo '{"default":[{"type":"insecureAcceptAnything"}]}' > "$WORK/policy.json"

rm -rf "$DEST"
mkdir -p "$DEST/images"
echo "SPR images: $TAG ($ARCH)" >&2
for entry in "${IMAGES[@]}"; do
  read -r name paths <<<"$entry"
  img=ghcr.io/spr-networks/super_$name
  digest=sha256:$(skopeo inspect --raw "docker://$img:$TAG" | sha256sum | cut -d' ' -f1)
  cosign verify-attestation --type slsaprovenance1 \
    --certificate-identity-regexp '^https://github\.com/spr-networks/super/\.github/workflows/docker-image\.yml@' \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com \
    "$img@$digest" >/dev/null 2>"$WORK/cosign.log" || { cat "$WORK/cosign.log" >&2; exit 1; }
  # the verified digest, not the tag, which can move
  skopeo copy --quiet --policy "$WORK/policy.json" --override-os linux --override-arch $ARCH \
    "docker://$img@$digest" "dir:$WORK/$name"
  mkdir "$WORK/$name.root"
  for layer in $(jq -r '.layers[].digest' "$WORK/$name/manifest.json"); do
    tar -xf "$WORK/$name/${layer#sha256:}" -C "$WORK/$name.root"
  done
  for path in $paths; do
    mkdir -p "$DEST/images/$name/$(dirname "$path")"
    cp -a "$WORK/$name.root/$path" "$DEST/images/$name/$path"
  done
  echo "$digest" > "$DEST/images/$name/digest"
  rm -rf "$WORK/$name" "$WORK/$name.root"
  echo "  super_$name $digest" >&2
done
echo "$TAG" > "$DEST/images/tag"

REPO=spr-networks/super
release=v${TAG%-dev}
curl -fsSL -o "$WORK/release.json" "https://api.github.com/repos/$REPO/releases/tags/$release"
kname=$(jq -r '.assets[].name | select(test("^spr-krun-runtime_.+_arm64[.]deb$"))' "$WORK/release.json" | head -n1)
if [ -z "$kname" ]; then
  echo "error: $release has no spr-krun-runtime arm64 .deb" >&2
  exit 1
fi
kurl=$(jq -r --arg n "$kname" '.assets[] | select(.name == $n) | .browser_download_url' "$WORK/release.json")
mkdir -p "$DEST/krun"
curl -fsSL -o "$DEST/krun/spr-krun-runtime.deb" "$kurl"
kdigest=$(sha256sum "$DEST/krun/spr-krun-runtime.deb" | cut -d' ' -f1)
curl -fsSL -o "$WORK/krun.attestations.json" \
  "https://api.github.com/repos/$REPO/attestations/sha256:$kdigest"
# the same .deb can be attested by other workflows too (it builds
# reproducibly): any one bundle from pi-iso.yml on main will do
n=$(jq '.attestations | length' "$WORK/krun.attestations.json")
verified=
for i in $(seq 0 $((n - 1))); do
  jq ".attestations[$i].bundle" "$WORK/krun.attestations.json" > "$WORK/krun.bundle.json"
  if cosign verify-blob-attestation --new-bundle-format --bundle "$WORK/krun.bundle.json" \
      --type slsaprovenance1 \
      --certificate-identity-regexp '^https://github\.com/spr-networks/super/\.github/workflows/pi-iso\.yml@refs/heads/main$' \
      --certificate-oidc-issuer https://token.actions.githubusercontent.com \
      "$DEST/krun/spr-krun-runtime.deb" >/dev/null 2>>"$WORK/cosign.log"; then
    verified=1
    break
  fi
done
if [ -z "$verified" ]; then
  cat "$WORK/cosign.log" >&2
  echo "error: no attestation of $kname from pi-iso.yml on main" >&2
  exit 1
fi
echo "  spr-krun-runtime ${kname} from $release (sha256:$kdigest)" >&2

./installer/raspbian/scripts/fetch-spr-kernel.sh "$WORK/kernel"
mkdir -p "$DEST/kernel"
cp "$WORK"/kernel/linux-image-*.deb "$DEST/kernel/"

. ./reproducible.env
curl -fsSL -o "$WORK/oxwifid.tar.gz" "$OXWIFID_ARM64_URL"
echo "$OXWIFID_ARM64_ARCHIVE_SHA256  $WORK/oxwifid.tar.gz" | sha256sum -c - >/dev/null
mkdir -p "$DEST/oxwifid"
tar -xzf "$WORK/oxwifid.tar.gz" -C "$DEST/oxwifid" --strip-components=1 \
  "barely-ap-v$OXWIFID_VERSION-aarch64-unknown-linux-musl/barely-ap" \
  "barely-ap-v$OXWIFID_VERSION-aarch64-unknown-linux-musl/barely-cli"
echo "$OXWIFID_BARELY_AP_ARM64_SHA256  $DEST/oxwifid/barely-ap" | sha256sum -c - >/dev/null
echo "$OXWIFID_BARELY_CLI_ARM64_SHA256  $DEST/oxwifid/barely-cli" | sha256sum -c - >/dev/null
echo "  oxwifid $OXWIFID_VERSION" >&2

# openwrt mt76 firmware, at installer/raspbian/scripts/pi-target-install.sh's
# commits: a pinned tree, then newer mt7996 firmware
mt76() {
  git init -q "$DEST/$1"
  git -C "$DEST/$1" fetch -q --depth 1 https://github.com/openwrt/mt76 "$2"
  git -C "$DEST/$1" checkout -q FETCH_HEAD -- firmware
  rm -rf "$DEST/$1/.git"
}
mt76 mt76 65bbd4c394a9d51f1ca5a0531166c22ff07d4e56
mt76 mt76-mt7996 018f60316d4dd6b4e741874eda40e2dfaa29df3b
echo "  mt76 firmware" >&2
