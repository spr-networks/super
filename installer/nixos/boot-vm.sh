#!/usr/bin/env bash
# Boot the SPR aarch64 image in QEMU to verify the kernel + userspace work.
#
# QEMU has no official Pi 5 machine type, so we boot:
#   - SPR's kernel (kernel_2712.img / kernel.img) on a generic ARM64 virt machine
#   - With the rootfs from the second partition
#
# This skips Pi-specific firmware/bootloader (start.elf, EEPROM) — that path
# is only validated on real Pi 5 hardware. But it verifies:
#   - Kernel boots
#   - Initramfs runs
#   - Rootfs mounts
#   - systemd starts
#   - SPR services start
#
# Usage:
#   ./installer/nixos/boot-vm.sh             # boot the image
#   ./installer/nixos/boot-vm.sh prepare     # just extract kernel + image (no boot)
#
# Inside QEMU:
#   - login: root / spr
#   - Ctrl-A X to quit

set -euo pipefail
cd "$(dirname "$0")/../.."

OUT=installer/nixos/output
ZST=$OUT/nixos-image-rpi5-kernel.img.zst
RAW=$OUT/nixos-image-rpi5-kernel.img
KERNEL=$OUT/kernel.img
INITRD=$OUT/initrd
DTB=$OUT/bcm2712-rpi-5-b.dtb
CMDLINE_FILE=$OUT/cmdline.txt

prepare() {
  if [ ! -f "$ZST" ]; then
    echo "ERROR: $ZST not found. Build first with ./installer/nixos/build-image.sh"
    exit 1
  fi

  if [ ! -f "$RAW" ] || [ "$ZST" -nt "$RAW" ]; then
    echo "Decompressing image..."
    zstd -d -f -o "$RAW" "$ZST"
    # free space after the root partition, like an SD card, so the
    # first-boot root expansion has room to grow
    truncate -s +2G "$RAW"
  fi

  # Extract boot.img from the FAT partition, then the kernel, initrd and
  # cmdline from inside it, as the Pi firmware does (mtools via docker:
  # macOS has no mcopy). BOOT_IMG=tryboot.img boots a staged update instead;
  # QEMU doesn't run the Pi firmware, so it can't pick tryboot.img itself.
  if [ ! -f "$KERNEL" ] || [ "$RAW" -nt "$KERNEL" ] || [ -n "${BOOT_IMG:-}" ]; then
    echo "Extracting ${BOOT_IMG:-boot.img} from FAT partition..."
    docker run --rm \
      -v "$(pwd)/$OUT":/out \
      alpine sh -c "
        apk add -q mtools >/dev/null
        mcopy -o -i /out/nixos-image-rpi5-kernel.img@@8388608 ::/${BOOT_IMG:-boot.img} /tmp/boot.img
        for f in kernel.img initrd cmdline.txt bcm2712-rpi-5-b.dtb; do
          mcopy -o -i /tmp/boot.img ::/\$f /out/\$f
        done
      "
  fi

  ls -lh "$KERNEL" "$DTB" "$INITRD" 2>&1 || true
}

run() {
  prepare
  echo ""
  echo "Booting in QEMU virt machine..."
  echo "  login: root / spr"
  echo "  quit:  Ctrl-A X"
  echo ""

  # Use the actual cmdline from the image, add console + root= for our VM.
  # The image's cmdline has `init=` but no `root=` (Pi firmware would normally
  # use initrd scanning); we add root=LABEL=NIXOS_SD which matches the
  # ext4 partition label produced by the community flake.
  REAL_CMDLINE=$(cat "$CMDLINE_FILE")
  FULL_CMDLINE="$REAL_CMDLINE root=LABEL=NIXOS_SD rootwait rw console=ttyAMA0"

  echo "Kernel cmdline: $FULL_CMDLINE"
  echo ""

  # SPR kernel is built for Pi 5: no PCI_HOST_GENERIC, so virtio-pci doesn't
  # enumerate on QEMU virt. SPR kernel does have VIRTIO_MMIO=y though, so
  # use the virtio-mmio transport variants of the devices.
  exec qemu-system-aarch64 \
    -machine virt \
    -cpu max \
    -m 2048 \
    -smp 4 \
    -kernel "$KERNEL" \
    -initrd "$INITRD" \
    -append "$FULL_CMDLINE" \
    -drive "id=hd,file=$RAW,format=raw,if=none" \
    -device virtio-blk-device,drive=hd \
    -netdev user,id=net0,hostfwd=tcp::8080-:80,hostfwd=tcp::2222-:22 \
    -device virtio-net-device,netdev=net0 \
    -nographic
}

case "${1:-run}" in
  prepare) prepare ;;
  run) run ;;
  *) echo "Usage: $0 {prepare|run}"; exit 1 ;;
esac
