#!/bin/bash
/scripts/mount.sh
cp /scripts/install.sh /mnt/fs/tmp/install.sh
cp /scripts/run-scripts/rc-local /mnt/fs/etc/rc.local
cp /scripts/run-scripts/setup.sh /mnt/fs/tmp/
cp /scripts/run-scripts/run.sh /mnt/fs/tmp/
cp /scripts/spr-environment.sh /mnt/fs/
cp -R /data/containers /mnt/fs/containers/
mount --bind /dev/ /mnt/fs/dev/
chroot /mnt/fs /tmp/install.sh
/scripts/unmount.sh
