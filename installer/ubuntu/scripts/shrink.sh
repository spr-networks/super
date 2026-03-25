#!/bin/bash
if [ $UID != 0 ]; then
	sudo $0
	exit
fi

IMG="./data/spr.img"
losetup -Pf $IMG
LOOP=$(losetup -j $IMG | cut -d: -f1)
# zerofree
zerofree ${LOOP}p2
losetup -d $LOOP
