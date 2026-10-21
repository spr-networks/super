#!/usr/bin/env bash
# Update a running SPR NixOS device in place, without reflashing.
#
# Builds the system here (in the same nixos/nix container as build-image.sh),
# copies only the store paths the device is missing over ssh, makes it the
# boot default, then keeps just the current and previous system and
# garbage-collects the rest.
#
# The boot partition holds one boot.img (pi5-boot-img.nix). The device
# stages the new one as tryboot.img; the next reboot tries it once and
# spr-boot-commit makes it boot.img after it comes up. update.sh builds the
# same boot.img here and checks the device's is identical, which is what
# lets a signature made here verify there. With SPR_BOOT_KEY=<private.pem>
# it signs it (rpi-eeprom-digest) and installs boot.sig with it.
#
# Usage:
#   ./installer/nixos/update.sh root@spr            # activate on next boot
#   ./installer/nixos/update.sh root@spr switch     # activate now
#   ./installer/nixos/update.sh root@spr reboot     # activate and reboot
#
# Needs ssh key access to the device (ssh-agent). For a VM from boot-vm.sh:
# SSH_PORT=12222. SSH_OPTS replaces the default ssh options.
#
# SPR's services come from the super_* images of SPR_IMAGE_TAG (default:
# the latest release), verified with cosign (fetch-images.sh): set it to
# the tag the device runs, or the build differs from the device's.
#
# QEMU (boot-vm.sh) skips the Pi firmware, so it can't do tryboot: boot the
# staged image with BOOT_IMG=tryboot.img ./installer/nixos/boot-vm.sh.
#
# Rolling back: on the device, run
#   /nix/var/nix/profiles/system-<n>-link/bin/switch-to-configuration boot
# for the previous generation <n>, and reboot.

set -euo pipefail
cd "$(dirname "$0")/../.."

# the Nix builder image, pinned in reproducible.env
NIX_REF=$(sed -n 's/^NIX_REF=//p' reproducible.env)
: "${NIX_REF:?NIX_REF missing from reproducible.env}"

TARGET=${1:?usage: $0 user@host [boot|switch|reboot]}
MODE=${2:-boot}
case "$MODE" in boot|switch|reboot) ;; *) echo "unknown mode $MODE"; exit 1 ;; esac

SSH_OPTS="${SSH_OPTS:--o StrictHostKeyChecking=accept-new} ${SSH_PORT:+-p $SSH_PORT}"
FLAKE_ATTR="./installer/nixos#nixosConfigurations.spr-aarch64.config.system.build.bootImg"
# spr.bootImg.sigDir on the device
SIG_DIR=/var/lib/spr-boot/sigs

# boot.img and boot.sig come back from the container here
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
KEY=()
if [ -n "${SPR_BOOT_KEY:-}" ]; then
  KEY=(-v "$(cd "$(dirname "$SPR_BOOT_KEY")" && pwd)/$(basename "$SPR_BOOT_KEY"):/boot-key.pem:ro")
fi

# ssh-agent for the container (Docker Desktop forwards the host agent here)
if [ "$(uname)" = Darwin ]; then
  AGENT=(-v /run/host-services/ssh-auth.sock:/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent)
else
  AGENT=(-v "${SSH_AUTH_SOCK:?ssh-agent required}":/ssh-agent -e SSH_AUTH_SOCK=/ssh-agent)
fi

# the container reaches a device on localhost through the docker host
CTARGET=$(echo "$TARGET" | sed -E 's/@(localhost|127\.0\.0\.1)$/@host.docker.internal/')

GIT_DIR_MOUNT=()
if [ -f .git ]; then
  # git worktree: mount the main repo's .git too
  GITDIR=$(git rev-parse --git-common-dir)
  GIT_DIR_MOUNT=(-v "$GITDIR:$GITDIR")
fi

echo "==> building and copying to $TARGET"
SYSTEM=$(docker run --rm --privileged \
  -v "$(pwd):$(pwd)" -w "$(pwd)" ${GIT_DIR_MOUNT[@]+"${GIT_DIR_MOUNT[@]}"} \
  -v spr-nix-store:/nix "${AGENT[@]}" -v "$WORK:/work" ${KEY[@]+"${KEY[@]}"} \
  -e NIX_SSHOPTS="$SSH_OPTS" \
  -e SPR_IMAGE_TAG="${SPR_IMAGE_TAG:-}" -e SPR_IMAGES=/tmp/spr-images \
  -e NIX_CONFIG="experimental-features = nix-command flakes
build-users-group =
sandbox = true" \
  "$NIX_REF" bash -c "
    set -e
    git config --global --add safe.directory '*'
    # ssh needs a passwd entry for root and a shell for nix copy's local
    # command (\$SHELL, else /bin/sh); the image's /etc/passwd and /bin/sh
    # link into its own store paths, which the spr-nix-store volume may lack
    export SHELL=\$(command -v bash)
    rm -f /etc/passwd /bin/sh
    echo \"root:x:0:0:root:/root:\$SHELL\" > /etc/passwd
    ln -s \$SHELL /bin/sh
    bash ./installer/nixos/fetch-images.sh \$SPR_IMAGES >&2
    img=\$(nix build --impure --no-link --print-out-paths '$FLAKE_ATTR')
    out=\$(readlink \$img/system)
    cp \$img/boot.img \$img/sha256 /work/
    if [ -e /boot-key.pem ]; then
      nix shell --inputs-from ./installer/nixos nixpkgs#raspberrypi-eeprom \\
        nixpkgs#openssl nixpkgs#xxd nixpkgs#gawk -c rpi-eeprom-digest -i /work/boot.img -o /work/boot.sig -k /boot-key.pem >&2
    fi
    nix shell --inputs-from ./installer/nixos nixpkgs#openssh \\
      -c nix copy --to 'ssh://$CTARGET' \"\$out\" >&2
    echo \"\$out\"
  ")

SHA=$(cat "$WORK/sha256")
echo "==> boot.img sha256 $SHA"
if [ -e "$WORK/boot.sig" ]; then
  echo "==> installing boot.sig"
  ssh $SSH_OPTS "$TARGET" "mkdir -p $SIG_DIR && cat > $SIG_DIR/$(basename "$SYSTEM").sig" < "$WORK/boot.sig"
fi

echo "==> activating $SYSTEM ($MODE)"
ACTION=$MODE
[ "$MODE" = reboot ] && ACTION=boot
ssh $SSH_OPTS "$TARGET" "
  set -e
  nix-env -p /nix/var/nix/profiles/system --set $SYSTEM
  $SYSTEM/bin/switch-to-configuration $ACTION
  nix-env -p /nix/var/nix/profiles/system --delete-generations +2
  nix-store --gc
  df -h / | tail -1
"

# the device built its own boot.img for this system; it has to be the same
# bytes as the one built (and signed) here
DEVICE_SHA=$(ssh $SSH_OPTS "$TARGET" "
  for f in boot tryboot; do
    [ \"\$(cat /boot/firmware/\$f.system 2>/dev/null)\" = $SYSTEM ] && sha256sum /boot/firmware/\$f.img
  done | cut -d' ' -f1 | head -n1")
if [ "$DEVICE_SHA" != "$SHA" ]; then
  echo "error: the device's boot.img (${DEVICE_SHA:-none}) differs from the one built here" >&2
  exit 1
fi
echo "==> device boot.img matches"

if [ "$MODE" = reboot ]; then
  echo "==> rebooting"
  ssh $SSH_OPTS "$TARGET" "systemctl reboot" || true
fi
