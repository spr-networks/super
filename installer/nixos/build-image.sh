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

set -euo pipefail
cd "$(dirname "$0")/../.."

ARCH="${1:-aarch64}"

case "$ARCH" in
  aarch64) TARGET="./installer/nixos#nixosConfigurations.spr-aarch64.config.system.build.sdImage"
           PLATFORM=linux/arm64 ;;
  *)       TARGET="./installer/nixos#images.spr-${ARCH}"
           PLATFORM=linux/amd64 ;;
esac

mkdir -p installer/nixos/output

# Flakes need the git dir; for a worktree that lives outside the checkout.
GITDIR=$(git rev-parse --path-format=absolute --git-common-dir)

# --privileged so the nix build sandbox works (sandbox=false breaks
# system-path: install-info can't find gzip on the builder PATH)
# --platform: the target's architecture, emulated through binfmt on
# another host (installer/qemu-setup-linux.sh)
docker run --rm --privileged --platform "$PLATFORM" \
  -v "$(pwd)":"$(pwd)" \
  -v "$GITDIR":"$GITDIR" \
  -w "$(pwd)" \
  -e SYSTEM_ARCHIVE="${SYSTEM_ARCHIVE:-}" -e SPR_RELEASE_VERSION="${SPR_RELEASE_VERSION:-}" \
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
  rm -f installer/nixos/output/nixos-image-* installer/nixos/output/*.iso installer/nixos/output/spr-nixos-system.tar
  cp -vf \$OUT/sd-image/*.img.zst installer/nixos/output/ 2>/dev/null || \
  cp -vf \$OUT/sd-image/*.img installer/nixos/output/ 2>/dev/null || \
  cp -vf \$OUT/iso/*.iso installer/nixos/output/ 2>/dev/null || \
  cp -vf \$OUT/* installer/nixos/output/ 2>/dev/null || true
  echo ''
  chmod u+w installer/nixos/output/* 2>/dev/null || true
  if [ -n \"\$SYSTEM_ARCHIVE\" ]; then
    echo '=== Writing the system archive ==='
    SYSTEM=\$(nix build ./installer/nixos#nixosConfigurations.spr-aarch64.config.system.build.toplevel --no-link --print-out-paths)
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
