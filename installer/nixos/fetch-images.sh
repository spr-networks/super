#!/usr/bin/env bash
# Fetch SPR's service binaries out of the published super_* images, and
# the release's spr-krun-runtime .deb, into $1 for the Nix build
# (SPR_IMAGES, flake.nix). Each image is the one Docker Image CI built:
# its provenance attestation is verified with cosign (the identity superd
# checks, AttestationSANRegex) and it is pulled by the verified digest.
# The .deb is the one pi-iso.yml built and attested on main.
#
# The tag is SPR_IMAGE_TAG (nixos-iso.yml: the release's, <version>-dev
# on dev), else the latest SPR release's; krun is from release v<version>.
#
# Runs in the nixos/nix container, from build-image.sh and update.sh.
set -euo pipefail
DEST=${1:?usage: $0 <dest-dir>}
F=./installer/nixos

for p in $(nix build --no-link --print-out-paths --inputs-from $F \
    nixpkgs#cosign nixpkgs#skopeo nixpkgs#jq nixpkgs#gnutar nixpkgs#gzip nixpkgs#curl nixpkgs#gnused); do
  PATH=$p/bin:$PATH
done
export PATH

TAG=${SPR_IMAGE_TAG:-}
if [ -z "$TAG" ]; then
  TAG=$(curl -fsSL https://api.github.com/repos/spr-networks/super/releases/latest | jq -r .tag_name)
  TAG=${TAG#v}
fi
case "$(uname -m)" in
  aarch64|arm64) ARCH=arm64 ;;
  x86_64) ARCH=amd64 ;;
  *) echo "unsupported architecture $(uname -m)" >&2; exit 1 ;;
esac

# <image> <paths in it>: what flake.nix takes from each
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
mkdir -p "$DEST"
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
    mkdir -p "$DEST/$name/$(dirname "$path")"
    cp -a "$WORK/$name.root/$path" "$DEST/$name/$path"
  done
  echo "$digest" > "$DEST/$name/digest"
  rm -rf "$WORK/$name" "$WORK/$name.root"
  echo "  super_$name $digest" >&2
done

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
kver=${kname#spr-krun-runtime_}; kver=${kver%_arm64.deb}
want=$(sed -n 's/^SPR_KRUN_PACKAGE_VERSION=//p' host-packages/spr-krun-runtime/versions.env)
if [ "$kver" != "$want" ]; then
  # a release build has to ship the runtime its own source describes
  case "${SPR_IMAGE_TAG:-}" in
    ""|*-dev) echo "note: $release ships spr-krun-runtime $kver, versions.env is $want" >&2 ;;
    *) echo "error: $release ships spr-krun-runtime $kver, versions.env is $want" >&2; exit 1 ;;
  esac
fi
echo "$kver" > "$DEST/krun/version"
echo "  spr-krun-runtime $kver from $release (sha256:$kdigest)" >&2

echo "$TAG" > "$DEST/tag"
