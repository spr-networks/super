#!/bin/bash
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
# cmdline.txt location varies by base image: older images put it at the top of
# the firmware partition, resolute moved it into the current/ slot directory.
CMDLINE=$(ls /mnt/boot/firmware/current/cmdline.txt /mnt/boot/firmware/cmdline.txt 2>/dev/null | head -1)
if [ -n "$CMDLINE" ] && ! grep -q "net.ifnames=0 biosdevname=0" "$CMDLINE"; then
  sed -i '$s/$/ net.ifnames=0 biosdevname=0/' "$CMDLINE"
fi

cp /mnt/boot/firmware/current/initrd.img /data/initrd 2>/dev/null || cp /mnt/fs/boot/initrd.img /data/initrd
cp /mnt/boot/firmware/current/vmlinuz /data/vmlinuz 2>/dev/null || cp /mnt/fs/boot/vmlinuz /data/vmlinuz

/scripts/unmount.sh
