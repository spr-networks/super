#!/bin/bash
if [ "$UID" -ne 0 ]; then
    exec sudo "$0" "$@"
fi

apt-get update || exit 1
apt-get install -y --only-upgrade apt '?and(?installed,?source-package(^apt$))' || exit 1
apt-get install -y --no-install-recommends qemu-utils cloud-guest-utils || exit 1

IMG="./data/spr.img"
qemu-img resize $IMG 10G
growpart $IMG 1

if [ ! -f $IMG ]; then
	echo "- missing image"
	exit
fi

losetup -Pf $IMG

export LOOP=$(losetup -j $IMG | cut -d: -f1)
export LOOP_ROOT="${LOOP}p1"

echo "+ loop is $LOOP"

e2fsck -pf $LOOP_ROOT
resize2fs $LOOP_ROOT

losetup -d $LOOP 2>/dev/null
