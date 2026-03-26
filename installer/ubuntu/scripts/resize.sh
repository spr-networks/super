#!/bin/bash
IMG="./data/spr.img"
qemu-img resize $IMG 14G
growpart $IMG 2

if [ ! -f $IMG ]; then
	echo "- missing image"
	exit
fi

if [ $UID != 0 ]; then
	sudo $0
	exit
fi


losetup -Pf $IMG

export LOOP=$(losetup -j $IMG | cut -d: -f1)
export LOOP_ROOT="${LOOP}p2"
export LOOP_BOOT="${LOOP}p1"

echo "+ loop is $LOOP"

RESIZE_CMD="e2fsck -f $LOOP_ROOT; e2fsck -f $LOOP_BOOT; resize2fs $LOOP_ROOT"
DOCKER_DEFAULT_PLATFORM="" docker pull ubuntu:23.10
DOCKER_DEFAULT_PLATFORM="" docker run --privileged -v $LOOP_ROOT:$LOOP_ROOT ubuntu:23.10 sh -c "$RESIZE_CMD"
losetup -d $LOOP 2>/dev/null
