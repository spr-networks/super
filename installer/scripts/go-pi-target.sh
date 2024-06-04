#!/bin/bash
/scripts/mount.sh
#cp -R /data/containers /mnt/fs/containers/
mount --bind /dev/ /mnt/fs/dev/
# running under aarch64, finish the rest of the setup for the pi
chroot /mnt/fs /tmp/pi-target-install.sh
/scripts/unmount.sh
