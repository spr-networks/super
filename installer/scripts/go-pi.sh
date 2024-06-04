#!/bin/bash
/scripts/mount.sh
cp /scripts/pi-cross-install.sh /mnt/fs/tmp/pi-cross-install.sh
cp /scripts/run-scripts/rc-local /mnt/fs/etc/rc.local
cp /scripts/spr-environment.sh /mnt/fs/
cp -R /data/containers /mnt/fs/containers/
cp /scripts/go-pi-target.sh /mnt/fs/load.sh
mount --bind /dev/ /mnt/fs/dev/
# this just downloads packages onto the image. not much else.
# the rest is done on an aarch64 conatiner with pi-target-install.sh
bash /scripts/pi-cross-install.sh

# disable iface renaming on the boot image.
if ! grep -q "net.ifnames=0 biosdevname=0" /mnt/boot/firmware/cmdline.txt; then
  sed -i '$s/$/ net.ifnames=0 biosdevname=0/' /mnt/boot/firmware/cmdline.txt
fi

cp /mnt/fs/boot/initrd.img /data/initrd
cp /mnt/fs/boot/vmlinuz /data/vmlinuz

/scripts/unmount.sh
