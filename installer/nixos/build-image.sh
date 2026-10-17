#!/usr/bin/env bash
# Build SPR bootable images.
#
# Usage:
#   ./installer/nixos/build-image.sh              # aarch64 SD image (Pi 5 / CM5)
#   ./installer/nixos/build-image.sh aarch64      # same
#   ./installer/nixos/build-image.sh x86_64       # x86_64 ISO
#
# Output is copied to installer/nixos/output/

set -euo pipefail
cd "$(dirname "$0")/../.."

ARCH="${1:-aarch64}"

case "$ARCH" in
  aarch64) TARGET="./installer/nixos#nixosConfigurations.spr-aarch64.config.system.build.sdImage" ;;
  *)       TARGET="./installer/nixos#images.spr-${ARCH}" ;;
esac

mkdir -p installer/nixos/output

# Flakes need the git dir; for a worktree that lives outside the checkout.
GITDIR=$(git rev-parse --path-format=absolute --git-common-dir)

# --privileged so the nix build sandbox works (sandbox=false breaks
# system-path: install-info can't find gzip on the builder PATH)
docker run --rm --privileged \
  -v "$(pwd)":"$(pwd)" \
  -v "$GITDIR":"$GITDIR" \
  -v spr-nix-store:/nix \
  -w "$(pwd)" \
  -e NIX_CONFIG="experimental-features = nix-command flakes
build-users-group =
sandbox = true" \
  nixos/nix:latest bash -c "
git config --global --add safe.directory '*'
echo '=== Building SPR ${ARCH} image ==='
OUT=\$(nix build ${TARGET} --no-link --print-out-paths --print-build-logs 2>&1 | tee /dev/stderr | tail -1)
if [ -d \"\$OUT\" ]; then
  echo ''
  echo '=== Copying image to installer/nixos/output/ ==='
  rm -f installer/nixos/output/nixos-image-* installer/nixos/output/*.iso
  cp -vf \$OUT/sd-image/*.img.zst installer/nixos/output/ 2>/dev/null || \
  cp -vf \$OUT/sd-image/*.img installer/nixos/output/ 2>/dev/null || \
  cp -vf \$OUT/iso/*.iso installer/nixos/output/ 2>/dev/null || \
  cp -vf \$OUT/* installer/nixos/output/ 2>/dev/null || true
  echo ''
  chmod u+w installer/nixos/output/* 2>/dev/null || true
  ls -lh installer/nixos/output/
else
  echo 'ERROR: nix build failed' >&2
  exit 1
fi
"

echo ""
echo "=== Done ==="
ls -lh installer/nixos/output/
