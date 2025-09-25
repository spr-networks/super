#!/bin/bash
set -e

shopt -s expand_aliases

if ! which docker-compose > /dev/null 2>&1; then
    # Set an alias for docker-compose if it's missing
    alias docker-compose='docker compose'
fi

cp ./data/spr.clean.img ./data/spr.img

./scripts/resize.sh

#use host for next ubuntu
DOCKER_DEFAULT_PLATFORM="" docker pull ubuntu:24.04
docker run --privileged -v /dev:/dev -v $PWD/data:/data -v $PWD/scripts:/scripts/ ubuntu:24.04 /scripts/go-pi.sh

pushd data
qemu-system-aarch64 -machine virt -cpu cortex-a72 -smp 2 -m 1G -initrd initrd -kernel vmlinuz -append "root=/dev/vda2 rootfstype=ext4 rw panic=0 net.ifnames=0 biosdevname=0 init=/pi-target-install.sh"   -drive file=spr.img,format=raw,if=none,id=hd0 -device virtio-blk-pci,drive=hd0  -netdev user,id=mynet -device virtio-net-pci,netdev=mynet -nographic
popd

./scripts/shrink.sh
