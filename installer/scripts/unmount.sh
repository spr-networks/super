#!/bin/bash
if [ $UID != 0 ]; then
	sudo $0
	exit
fi

umount boot 2>/dev/null
umount fs 2>/dev/null
umount /mnt/boot/firmware
umount /mnt/fs

IMG="./data/spr.img"
LOOP=$(losetup -j $IMG | cut -d: -f1)
losetup -d $LOOP 2>/dev/null

# as a hack, we do losetup again
losetup -Pf $IMG
LOOP=$(losetup -j $IMG | cut -d: -f1)
# fsck
e2fsck -f ${LOOP}p2
# resize
resize2fs ${LOOP}p2 4G
losetup -d $LOOP

# truncate image
truncate -s 5 $IMG
