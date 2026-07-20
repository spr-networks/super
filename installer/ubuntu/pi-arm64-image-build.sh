#!/bin/bash
set -e

shopt -s expand_aliases

if ! which docker-compose > /dev/null 2>&1; then
    # Set an alias for docker-compose if it's missing
    alias docker-compose='docker compose'
fi

cp ./data/spr.clean.img ./data/spr.img

./scripts/resize.sh

mapfile -t KRUN_DEBS < <(find ../../dist -maxdepth 1 -name 'spr-krun-runtime_*_arm64.deb' -print)
if [ "${#KRUN_DEBS[@]}" -ne 1 ]; then
  echo "expected exactly one dist/spr-krun-runtime_*_arm64.deb; found ${#KRUN_DEBS[@]}" >&2
  exit 1
fi

# Run cross-install and QEMU in a single container so the loop device
# created by mount.sh is released in the same kernel context before QEMU
# opens the image.  spr-pi-builder already has qemu-system-aarch64.
docker run --privileged -v /dev:/dev -v "$PWD/data:/data" -v "$PWD/scripts:/scripts/" -v "$PWD/firmware:/firmware/" -v "$PWD/../../dist:/packages:ro" spr-pi-builder bash -c '
  set -e
  /scripts/go-pi.sh
  qemu-system-aarch64 -machine virt -cpu cortex-a72 -smp 2 -m 1G -no-reboot \
    -initrd /data/initrd -kernel /data/vmlinuz \
    -append "root=/dev/vda2 rootfstype=ext4 rw panic=-1 net.ifnames=0 biosdevname=0 init=/pi-target-install.sh" \
    -drive if=none,id=hd0,file=/data/spr.img,format=raw \
    -device virtio-blk-pci,drive=hd0 \
    -netdev user,id=mynet \
    -device virtio-net-pci,netdev=mynet,romfile= \
    -nographic | tee /tmp/qemu.log
  if ! grep -q "===SPR_INSTALL_OK===" /tmp/qemu.log; then
    echo "FATAL: pi-target-install.sh did not complete successfully" >&2
    exit 1
  fi
'

./scripts/shrink.sh
