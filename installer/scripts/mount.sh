#!/bin/bash
IMG="/data/spr.img"

if [ ! -f $IMG ]; then
	echo "- missing image"
	exit
fi

if [ $UID != 0 ]; then
	sudo $0
	exit
fi

echo $IMG

losetup -Pf $IMG

export LOOP=$(losetup -j $IMG | cut -d: -f1)
export LOOP_ROOT="${LOOP}p2"
export LOOP_BOOT="${LOOP}p1"

echo "+ loop is $LOOP"
echo "+ boot is $LOOP_BOOT"
echo "+ root is $LOOP_ROOT"

mkdir /mnt/fs
mount $LOOP_ROOT /mnt/fs
mkdir -p /mnt/boot/firmware 2>/dev/null
mount $LOOP_BOOT /mnt/boot/firmware
