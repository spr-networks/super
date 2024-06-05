#!/bin/bash
/scripts/mount-clearfog.sh
cp /scripts/install.sh /mnt/fs/tmp/install.sh
cp /scripts/run-scripts/rc-local /mnt/fs/etc/rc.local
cp /scripts/run-scripts/setup.sh /mnt/fs/
cp /scripts/run-scripts/run.sh /mnt/fs/
cp /scripts/spr-environment-clearfog.sh /mnt/fs/spr-environment.sh
cp -R /data/containers /mnt/fs/containers/
mount --bind /dev/ /mnt/fs/dev/
chroot /mnt/fs /tmp/install.sh
sed -i s/WANIF=eth0/WANIF=eth2/ /mnt/fs/home/spr/super/configs/base/config.sh
/scripts/unmount-clearfog.sh
