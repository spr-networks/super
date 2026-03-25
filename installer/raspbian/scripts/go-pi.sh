#!/bin/bash

# Detach any stale loop devices left over from previous failed runs.
# Multiple loops on the same file cause losetup -j to return garbage.
losetup -j /data/spr.img 2>/dev/null | cut -d: -f1 | xargs -r losetup -d 2>/dev/null || true

/scripts/mount.sh
cp /scripts/pi-cross-install.sh /mnt/fs/tmp/pi-cross-install.sh
cp /scripts/run-scripts/rc-local /mnt/fs/etc/rc.local
cp /scripts/run-scripts/setup.sh /mnt/fs/
cp /scripts/run-scripts/run.sh /mnt/fs/
cp /scripts/spr-environment.sh /mnt/fs/
cp /scripts/pi-target-install.sh /mnt/fs/pi-target-install.sh
mount --bind /dev/ /mnt/fs/dev/
# this just downloads packages onto the image. not much else.
# the rest is done on an aarch64 conatiner with pi-target-install.sh
bash /scripts/pi-cross-install.sh

# ath12k firmware for QCN9274
mkdir -p /mnt/fs/lib/firmware/ath12k/QCN9274/hw2.0
cp /firmware/ath12k/* /mnt/fs/lib/firmware/ath12k/QCN9274/hw2.0/

# disable iface renaming on the boot image.
if ! grep -q "net.ifnames=0 biosdevname=0" /mnt/boot/firmware/cmdline.txt; then
  sed -i '$s/$/ net.ifnames=0 biosdevname=0/' /mnt/boot/firmware/cmdline.txt
fi

umount /mnt/fs/dev

# Unmount image partitions and release the loop device before QEMU opens the file.
# Use the absolute path that losetup -Pf was given so the lookup succeeds.
umount /mnt/boot/firmware 2>/dev/null || true
umount /mnt/fs 2>/dev/null || true
LOOP=$(losetup -j /data/spr.img | cut -d: -f1)
[ -n "$LOOP" ] && losetup -d "$LOOP" 2>/dev/null || true
sync
