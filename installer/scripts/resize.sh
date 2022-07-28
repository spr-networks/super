#!/bin/bash
IMG="./data/spr.img"
qemu-img resize $IMG 8G
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

e2fsck -f $LOOP_ROOT
resize2fs $LOOP_ROOT

losetup -d $LOOP 2>/dev/null
