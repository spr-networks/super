#!/bin/bash
if [ $UID != 0 ]; then
	sudo $0
	exit
fi

IMG="./data/spr.img"
# as a hack, we do losetup again
losetup -Pf $IMG
LOOP=$(losetup -j $IMG | cut -d: -f1)
# fsck
e2fsck -pf ${LOOP}p2
# resize
resize2fs ${LOOP}p2 4G
losetup -d $LOOP

# truncate image
truncate -s 5G $IMG
