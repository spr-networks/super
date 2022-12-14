#!/bin/bash
/scripts/mount-clearfog.sh
cp /scripts/install.sh /mnt/fs/tmp/install.sh
cp /scripts/run-scripts/rc-local /mnt/fs/etc/rc.local
cp /scripts/run-scripts/setup.sh /mnt/fs/tmp/
cp /scripts/run-scripts/run.sh /mnt/fs/tmp/
cp /scripts/spr-environment-clearfog.sh /mnt/fs/spr-environment.sh
cp -R /data/containers /mnt/fs/containers/
mount --bind /dev/ /mnt/fs/dev/
chroot /mnt/fs /tmp/install.sh
/scripts/unmount-clearfog.sh
