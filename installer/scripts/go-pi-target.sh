#!/bin/bash
/scripts/mount.sh
cp /scripts/pi-target-install.sh /mnt/fs/tmp/pi-target-install.sh
cp /scripts/run-scripts/setup.sh /mnt/fs/tmp/
cp /scripts/run-scripts/run.sh /mnt/fs/tmp/
cp -R /data/containers /mnt/fs/containers/
mount --bind /dev/ /mnt/fs/dev/
# running under aarch64, finish the rest of the setup for the pi
chroot /mnt/fs /tmp/pi-target-install.sh
/scripts/unmount.sh
/scripts/shrink.sh
