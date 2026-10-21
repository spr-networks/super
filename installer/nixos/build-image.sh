#!/usr/bin/env bash
# Build SPR bootable images.
#
# Usage:
#   ./installer/nixos/build-image.sh              # aarch64 SD image (Pi 5 / CM5)
#   ./installer/nixos/build-image.sh aarch64      # same
#   ./installer/nixos/build-image.sh x86_64       # x86_64 ISO
#
# Output is copied to installer/nixos/output/
#
# SYSTEM_ARCHIVE=1 (aarch64) also writes spr-nixos-system.tar, the system's
# closure as a nix binary cache plus system.json, which devices update from
# (superd/nixos/sysupdate.go). SPR_RELEASE_VERSION goes into system.json.
#
# SPR's services come from the super_* images of SPR_IMAGE_TAG (default:
# the latest release), verified with cosign (fetch-images.sh).

set -euo pipefail
cd "$(dirname "$0")/../.."

ARCH="${1:-aarch64}"

# nix runs natively: under qemu-user it fails setting up a builder's
# pseudoterminal
case "$(uname -m)" in
  x86_64)        HOST=x86_64 PLATFORM=linux/amd64 ;;
  aarch64|arm64) HOST=aarch64 PLATFORM=linux/arm64 ;;
  *) echo "unsupported build host $(uname -m)" >&2; exit 1 ;;
esac

# aarch64 on an x86_64 host is cross-compiled (spr-aarch64-cross). What
# can only build on aarch64 (nixos-raspberrypi's firmware unpack) runs
# through binfmt (installer/qemu-setup-linux.sh) as an extra platform.
CONFIG=spr-aarch64
[ "$HOST" = x86_64 ] && CONFIG=spr-aarch64-cross
case "$ARCH" in
  aarch64) TARGET="./installer/nixos#nixosConfigurations.${CONFIG}.config.system.build.sdImage" ;;
  *)       TARGET="./installer/nixos#images.spr-${ARCH}" ;;
esac
EXTRA_PLATFORMS=""
[ "$HOST" = "$ARCH" ] || EXTRA_PLATFORMS="extra-platforms = ${ARCH}-linux"

mkdir -p installer/nixos/output

# the Nix builder image, pinned in reproducible.env
NIX_REF=$(sed -n 's/^NIX_REF=//p' reproducible.env)
: "${NIX_REF:?NIX_REF missing from reproducible.env}"

# Flakes need the git dir; for a worktree that lives outside the checkout.
GITDIR=$(git rev-parse --path-format=absolute --git-common-dir)

# --privileged so the nix build sandbox works (sandbox=false breaks
# system-path: install-info can't find gzip on the builder PATH)
# --platform: the host's, so a cached image of another architecture
# isn't run emulated
# spr-nix-store: the store persists, as for update.sh and update-pins.sh,
# so a rebuild only builds what changed
docker run --rm --privileged --platform "$PLATFORM" \
  -v spr-nix-store:/nix \
  -v "$(pwd)":"$(pwd)" \
  -v "$GITDIR":"$GITDIR" \
  -w "$(pwd)" \
  -e SYSTEM_ARCHIVE="${SYSTEM_ARCHIVE:-}" -e SPR_RELEASE_VERSION="${SPR_RELEASE_VERSION:-}" \
  -e SPR_IMAGE_TAG="${SPR_IMAGE_TAG:-}" -e SPR_IMAGES=/tmp/spr-images \
  -e NIX_CONFIG="experimental-features = nix-command flakes
build-users-group =
sandbox = true
$EXTRA_PLATFORMS" \
  "$NIX_REF" bash -c "
git config --global --add safe.directory '*'
bash ./installer/nixos/fetch-images.sh \$SPR_IMAGES || exit 1
echo '=== Building SPR ${ARCH} image ==='
OUT=\$(nix build --impure ${TARGET} --no-link --print-out-paths --print-build-logs 2>&1 | tee /dev/stderr | tail -1)
if [ -d \"\$OUT\" ]; then
  echo ''
  echo '=== Copying image to installer/nixos/output/ ==='
  rm -f installer/nixos/output/nixos-image-* installer/nixos/output/*.iso installer/nixos/output/spr-nixos-system.tar
  cp -vf \$OUT/sd-image/*.img.zst installer/nixos/output/ 2>/dev/null || \
  cp -vf \$OUT/sd-image/*.img installer/nixos/output/ 2>/dev/null || \
  cp -vf \$OUT/iso/*.iso installer/nixos/output/ 2>/dev/null || \
  cp -vf \$OUT/* installer/nixos/output/ 2>/dev/null || true
  echo ''
  chmod u+w installer/nixos/output/* 2>/dev/null || true
  if [ -n \"\$SYSTEM_ARCHIVE\" ]; then
    echo '=== Writing the system archive ==='
    SYSTEM=\$(nix build --impure ./installer/nixos#nixosConfigurations.${CONFIG}.config.system.build.toplevel --no-link --print-out-paths)
    ARCHIVE=\$(mktemp -d)
    nix copy --to \"file://\$ARCHIVE/cache?compression=xz&parallel-compression=true\" \"\$SYSTEM\"
    printf '{\"System\": \"%s\", \"Version\": \"%s\"}\\n' \"\$SYSTEM\" \"\$SPR_RELEASE_VERSION\" > \$ARCHIVE/system.json
    nix shell --inputs-from ./installer/nixos nixpkgs#gnutar -c \\
      tar -C \$ARCHIVE --owner=0 --group=0 --sort=name -cf installer/nixos/output/spr-nixos-system.tar system.json cache
    rm -rf \$ARCHIVE
  fi
  ls -lh installer/nixos/output/
else
  echo 'ERROR: nix build failed' >&2
  exit 1
fi
"

echo ""
echo "=== Done ==="
ls -lh installer/nixos/output/
