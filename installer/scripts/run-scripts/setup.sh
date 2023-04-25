#!/bin/bash
### additional SPR setup

set -a
. /spr-environment.sh

ip link set $WANIF up
dhclient $WANIF
dpkg-reconfigure openssh-server


# Resize to full disk
ROOTPART=$(mount | grep " / " | awk '{print $1}')

PART=$(echo $ROOTPART | sed 's/[0-9]*$//')
PART=$(echo $PART | sed 's/p$//')
PARTNUM=$(echo $ROOTPART | sed 's/^.*[^0-9]\([0-9]\+\)$/\1/')

growpart $PART $PARTNUM
resize2fs $ROOTPART

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y --fix-broken install
dpkg --configure -a

if grep --quiet Raspberry /proc/cpuinfo; then
  apt-get -y install linux-modules-extra-raspi
fi

# disable iptables for  docker
echo -ne "{\n  \"iptables\": false\n}" > /etc/docker/daemon.json

#try docker-compose pull, else, load the offline containers

cd /home/spr/super/
docker-compose -f $COMPOSE_FILE pull
ret=$?

if [ "$ret" -ne "0" ]; then
cd /containers
  for x in `ls *.tar.gz`
  do
    docker load -i $x
  done
fi

rm -f /containers
if grep --quiet Raspberry /proc/cpuinfo; then
  if ! grep -q "net.ifnames=0 biosdevname=0" /boot/firmware/cmdline.txt; then
    sed -i '$s/$/ net.ifnames=0 biosdevname=0/' /boot/firmware/cmdline.txt
  fi
else
  # TBD check the story for clearfog
  mv /lib/udev/rules.d/80-net-setup-link.rules /lib/udev/rules.d/80-net-setup-link.rules.bak
  ln -s /dev/null /lib/udev/rules.d/80-net-setup-link.rules
fi

touch /home/spr/.spr-setup-done

reboot
