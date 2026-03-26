#!/bin/bash
set -e

shopt -s expand_aliases

if ! which docker-compose > /dev/null 2>&1; then
    # Set an alias for docker-compose if it's missing
    alias docker-compose='docker compose'
fi

cp ./data/spr.clean.img ./data/spr.img

./scripts/resize.sh

# Fetch Debian arm64 kernel+initrd for the QEMU build phase.
# RPiOS kernel lacks virtio_blk; the Debian generic arm64 kernel has it.
# Done in a throwaway container so the RPiOS image is never touched.
DOCKER_DEFAULT_PLATFORM=linux/arm64 docker run --rm \
  -v $PWD/data:/data \
  debian:trixie \
  sh -c 'echo force-unsafe-io > /etc/dpkg/dpkg.cfg.d/docker && apt-get update -qq && apt-get install -y -q --no-install-recommends linux-image-arm64 initramfs-tools && echo vfat >> /etc/initramfs-tools/modules && echo nls_cp437 >> /etc/initramfs-tools/modules && echo nls_ascii >> /etc/initramfs-tools/modules && KVER=$(ls /lib/modules/ | tail -1) && update-initramfs -u -k $KVER && cp /boot/vmlinuz-${KVER} /data/vmlinuz && cp /boot/initrd.img-${KVER} /data/initrd'

# Run cross-install and QEMU in a single container so the loop device
# created by mount.sh is released in the same kernel context before QEMU
# opens the image.  spr-pi-builder already has qemu-system-aarch64.
docker run --privileged -v /dev:/dev -v $PWD/data:/data -v $PWD/scripts:/scripts/ -v $PWD/firmware:/firmware/ spr-pi-builder bash -c '
  /scripts/go-pi.sh
  qemu-system-aarch64 -machine virt -cpu cortex-a72 -smp 2 -m 1G \
    -initrd /data/initrd -kernel /data/vmlinuz \
    -append "root=/dev/vda2 rootfstype=ext4 rw panic=0 net.ifnames=0 biosdevname=0 init=/pi-target-install.sh" \
    -drive if=none,id=hd0,file=/data/spr.img,format=raw \
    -device virtio-blk-pci,drive=hd0 \
    -netdev user,id=mynet \
    -device virtio-net-pci,netdev=mynet,romfile= \
    -nographic
'

./scripts/shrink.sh
