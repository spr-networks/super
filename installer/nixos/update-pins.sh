#!/usr/bin/env bash
# Refresh installer/nixos/pins.json, the Nix build's pins beyond
# reproducible.env:
#   - kernel: the latest spr-debian-kernel release, attestation-verified
#     (installer/raspbian/scripts/fetch-spr-kernel.sh)
#   - frontend: the super_frontend image of the latest SPR release
#   - src, vendorHash: the Nix hash of every reproducible.env source and Go
#     module set, found by building each one
#   - krun: libkrun's cargo vendor hash (spr-krun-runtime.nix)
#
# ../../update-pins.sh runs this after rewriting reproducible.env. Run it on
# its own after changing a go.mod/go.sum. Everything runs in the nixos/nix
# container (like build-image.sh), so the host only needs docker.
# Review: git diff installer/nixos/pins.json
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "Resolving Nix pins..." >&2
GITDIR=$(git rev-parse --path-format=absolute --git-common-dir)
docker run --rm --privileged \
  -v "$(pwd)":"$(pwd)" -v "$GITDIR":"$GITDIR" -v spr-nix-store:/nix -w "$(pwd)" \
  -e NIX_CONFIG="experimental-features = nix-command flakes
build-users-group =
sandbox = true" \
  nixos/nix:latest bash -c '
set -euo pipefail
git config --global --add safe.directory "*"
F=./installer/nixos
PINS=$F/pins.json
SYS=$(nix eval --impure --raw --expr builtins.currentSystem)
say() { echo "  $*" >&2; }
# tools from the flake'"'"'s nixpkgs
for p in $(nix build --no-link --print-out-paths --inputs-from $F \
    nixpkgs#jq nixpkgs#gh nixpkgs#skopeo nixpkgs#curl nixpkgs#gawk nixpkgs#gnused nixpkgs#gnugrep); do
  PATH=$p/bin:$PATH
done
export PATH
# set <jq path> <string>
set_pin() { jq --arg v "$2" "$1 = \$v" "$PINS" > "$PINS.tmp" && mv "$PINS.tmp" "$PINS"; }
FAKE=sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=

WORK=$(mktemp -d)
say "spr-debian-kernel: latest release"
bash installer/raspbian/scripts/fetch-spr-kernel.sh "$WORK/kernel" > "$WORK/kernel.log"
deb=$(cd "$WORK/kernel" && ls linux-image-*.deb)
tag=$(awk -v n="$deb" "\$2 == n { sub(/.*@/, \"\"); print }" "$WORK/kernel.log")
mod=${deb#linux-image-}; mod=${mod%%_*}
set_pin .kernel.release "$tag"
set_pin .kernel.version "${mod%%-*}"
set_pin .kernel.modDirVersion "$mod"
set_pin .kernel.url "https://github.com/spr-networks/spr-debian-kernel/releases/download/${tag}/${deb//+/%2B}"
set_pin .kernel.hash "$(nix hash file --sri --type sha256 "$WORK/kernel/$deb")"
say "  $tag ($mod)"

say "super_frontend: image of the latest SPR release"
ftag=$(curl -fsSL https://api.github.com/repos/spr-networks/super/releases/latest | jq -r ".tag_name | ltrimstr(\"v\")")
fdigest=sha256:$(skopeo inspect --raw "docker://ghcr.io/spr-networks/super_frontend:$ftag" | sha256sum | cut -d" " -f1)
# a new image: drop the old hash, which still matches the old image
[ "$(jq -r .frontend.digest "$PINS")" = "$fdigest" ] || set_pin .frontend.hash "$FAKE"
set_pin .frontend.tag "$ftag"
set_pin .frontend.digest "$fdigest"
say "  $ftag ($fdigest)"

# check <jq path> <flake attr>: build the fixed-output derivation the pin
# covers and take the hash nix computes. --rebuild refetches one already in
# the store: an unchanged hash would otherwise reuse the old content.
check() {
  local key=$1 attr=$F#$2 out log got try
  for try in 1 2 3; do
    out=$(nix eval --raw "$attr.outPath" 2>/dev/null || true)
    if [ -n "$out" ] && nix path-info "$out" >/dev/null 2>&1; then
      log=$(nix build --no-link --rebuild "$attr" 2>&1) && return 0
    else
      log=$(nix build --no-link "$attr" 2>&1) && return 0
    fi
    got=$(sed -n "s/^ *got: *\(sha256-[^ ]*\).*/\1/p" <<<"$log" | tail -n1)
    if [ -z "$got" ]; then
      echo "$log" >&2
      echo "error: building $attr failed" >&2
      exit 1
    fi
    say "  $key: $got"
    set_pin "$key" "$got"
  done
  echo "error: $key did not settle" >&2
  exit 1
}

say "Nix hashes: sources, Go modules, frontend image"
for s in $(jq -r ".src | keys[]" "$PINS"); do
  [ "$s" = spr-dns ] || check ".src.\"$s\"" "legacyPackages.$SYS.sources.$s"
done
# CoreDNS with the SPR plugins go-got in (dns/Dockerfile), then its modules
check ".src.\"spr-dns\"" "packages.$SYS.spr-dns.src"
for p in $(jq -r ".vendorHash | keys[]" "$PINS"); do
  check ".vendorHash.\"$p\"" "packages.$SYS.$p.goModules"
done
check .frontend.hash "packages.$SYS.spr-frontend"
# libkrun's crates, at the host-packages/spr-krun-runtime/versions.env commit
check .krun.cargoHash "packages.$SYS.spr-krun-runtime.libkrun.cargoDeps"

go=$(nix eval --raw "$F#packages.$SYS.spr-api.go.version")
want=$(sed -n "s/^GO_VERSION=//p" reproducible.env)
[ "$go" = "$want" ] || say "note: nixpkgs builds with go $go, the Docker build with go $want"
rm -rf "$WORK"
'

echo "Done. Review: git diff installer/nixos/pins.json" >&2
