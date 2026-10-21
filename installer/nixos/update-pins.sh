#!/usr/bin/env bash
# Refresh installer/nixos/pins.json, the Nix build's pins beyond
# reproducible.env:
#   - kernel: the latest spr-debian-kernel release, attestation-verified
#     (installer/raspbian/scripts/fetch-spr-kernel.sh)
#   - go, src, vendorHash: the Nix hash of the Go source (GO_VERSION) and
#     every source and Go module set, found by building each one
#
# SPR's service images and krun runtime aren't pinned: fetch-images.sh
# fetches the release's and verifies them with cosign at build time.
#
# ../../update-pins.sh runs this after rewriting reproducible.env. Run it on
# its own after changing a go.mod/go.sum. Everything runs in the nixos/nix
# container (like build-image.sh), so the host only needs docker.
# Review: git diff installer/nixos/pins.json
set -euo pipefail
cd "$(dirname "$0")/../.."

# the Nix builder image, pinned in reproducible.env
NIX_REF=$(sed -n 's/^NIX_REF=//p' reproducible.env)
: "${NIX_REF:?NIX_REF missing from reproducible.env}"
echo "Resolving Nix pins..." >&2
GITDIR=$(git rev-parse --path-format=absolute --git-common-dir)
docker run --rm --privileged \
  -v "$(pwd)":"$(pwd)" -v "$GITDIR":"$GITDIR" -v spr-nix-store:/nix -w "$(pwd)" \
  -e NIX_CONFIG="experimental-features = nix-command flakes
build-users-group =
sandbox = true" \
  "$NIX_REF" bash -c '
set -euo pipefail
git config --global --add safe.directory "*"
F=./installer/nixos
PINS=$F/pins.json
SYS=$(nix eval --impure --raw --expr builtins.currentSystem)
say() { echo "  $*" >&2; }
# tools from the flake'"'"'s nixpkgs
for p in $(nix build --no-link --print-out-paths --inputs-from $F \
    nixpkgs#jq nixpkgs#gh nixpkgs#curl nixpkgs#gawk nixpkgs#gnused nixpkgs#gnugrep); do
  PATH=$p/bin:$PATH
done
export PATH
# set <jq path> <string>
set_pin() { jq --arg v "$2" "$1 = \$v" "$PINS" > "$PINS.tmp" && mv "$PINS.tmp" "$PINS"; }

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

say "Nix hashes: sources, Go modules"
for s in $(jq -r ".src | keys[]" "$PINS"); do
  check ".src.\"$s\"" "legacyPackages.$SYS.sources.$s"
done
# Go at reproducible.env GO_VERSION, as the Docker build
check .go "packages.$SYS.spr-superd.go.src"
for p in $(jq -r ".vendorHash | keys[]" "$PINS"); do
  check ".vendorHash.\"$p\"" "packages.$SYS.$p.goModules"
done

rm -rf "$WORK"
'

echo "Done. Review: git diff installer/nixos/pins.json" >&2
