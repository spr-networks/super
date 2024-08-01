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
e2fsck -f ${LOOP}p2
# resize
resize2fs ${LOOP}p2 5G
losetup -d $LOOP

# truncate image
truncate -s 6G $IMG
