#!/bin/bash
# Install a matched Pi 4/Pi 5 kernel pair into the firmware boot partition.
# The optional root directory lets tests exercise the layout without mounts.
set -euo pipefail
KVER_PI4=${1:?usage: $0 <pi4-kver> <pi5-kver> [root-dir]}
KVER_PI5=${2:?usage: $0 <pi4-kver> <pi5-kver> [root-dir]}
ROOT=${3:-/}
ROOT=${ROOT%/}
BOOT="$ROOT/boot/firmware"

if [[ ! "$KVER_PI4" =~ ^([0-9]+\.[0-9]+\.[0-9]+)-v8\+$ ]] ||
   [ "$KVER_PI5" != "${BASH_REMATCH[1]}-v8-16k+" ]; then
  echo "expected matching 4 KB v8+ and 16 KB v8-16k+ kernels" >&2
  exit 1
fi

# Validate the complete pair before overwriting any boot files.
grep -qx 'CONFIG_ARM64_4K_PAGES=y' "$ROOT/boot/config-$KVER_PI4"
grep -qx 'CONFIG_ARM64_16K_PAGES=y' "$ROOT/boot/config-$KVER_PI5"
test -f "$BOOT/config.txt"
for kver in "$KVER_PI4" "$KVER_PI5"; do
  test -s "$ROOT/boot/vmlinuz-$kver"
  test -s "$ROOT/boot/initrd.img-$kver"
  test -d "$ROOT/lib/modules/$kver"
done
shopt -s nullglob
dtbs_pi4=("$ROOT/usr/lib/linux-image-$KVER_PI4"/broadcom/bcm2711*.dtb)
dtbs_pi5=("$ROOT/usr/lib/linux-image-$KVER_PI5"/broadcom/bcm2712*.dtb)
overlays=("$ROOT/usr/lib/linux-image-$KVER_PI5"/overlays/*.dtbo)
test "${#dtbs_pi4[@]}" -gt 0
test "${#dtbs_pi5[@]}" -gt 0
test "${#overlays[@]}" -gt 0

cp "$ROOT/boot/vmlinuz-$KVER_PI4" "$BOOT/kernel8.img"
cp "$ROOT/boot/initrd.img-$KVER_PI4" "$BOOT/initramfs8"
cp "$ROOT/boot/vmlinuz-$KVER_PI5" "$BOOT/kernel_2712.img"
cp "$ROOT/boot/initrd.img-$KVER_PI5" "$BOOT/initramfs_2712"
cp "${dtbs_pi4[@]}" "${dtbs_pi5[@]}" "$BOOT/"
mkdir -p "$BOOT/overlays"
cp "${overlays[@]}" "$BOOT/overlays/"

# Firmware derives the matching initramfs name from the selected kernel.
# Put these overrides last, outside any inherited model filter. Re-running
# the helper replaces its own block, leaving other config.txt settings alone.
config=$(mktemp)
trap 'rm -f "$config"' EXIT
awk '
  /^# BEGIN SPR KERNELS$/ { skip = 1; next }
  /^# END SPR KERNELS$/ { skip = 0; next }
  !skip { print }
' "$BOOT/config.txt" > "$config"
cat >> "$config" <<'EOF'
# BEGIN SPR KERNELS
[all]
arm_64bit=1
auto_initramfs=1
kernel=kernel8.img
[pi5]
kernel=kernel_2712.img
[all]
# END SPR KERNELS
EOF
cp "$config" "$BOOT/config.txt"
cmp "$ROOT/boot/vmlinuz-$KVER_PI4" "$BOOT/kernel8.img"
cmp "$ROOT/boot/initrd.img-$KVER_PI4" "$BOOT/initramfs8"
cmp "$ROOT/boot/vmlinuz-$KVER_PI5" "$BOOT/kernel_2712.img"
cmp "$ROOT/boot/initrd.img-$KVER_PI5" "$BOOT/initramfs_2712"
