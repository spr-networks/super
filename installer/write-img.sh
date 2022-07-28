#!/bin/bash

sudo umount boot 2>/dev/null
sudo umount fs 2>/dev/null

IMG=./data/spr.img
OF=$1

umount ${OF}1
umount ${OF}2

if [ ! -f $IMG ]; then
	echo "- missing ${IMG}. exiting"
	exit
fi

echo "[+] writing SPR to ${OF}..."
sudo dd if=$IMG of=$OF bs=32M status=progress

sync
eject $OF

# Resize to full disk -> done in setup now
#growpart $OF 2
#e2fsck -f ${OF}2
#resize2fs ${OF}2
