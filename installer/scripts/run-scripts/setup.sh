#!/bin/bash
### additional SPR setup

set -a
. /spr-environment.sh

ip link set $WANIF up
dhclient $WANIF
dpkg-reconfigure openssh-server


# Resize to full disk
ROOTPART=$(df | grep " /$" | awk '{print $1}')

PART=$(echo $ROOTPART | sed -E 's/^\/dev\/([a-z]+[0-9]*)([p]?[0-9]*).*$/\1/')
PARTNUM=$(echo $ROOTPART | sed -E 's/^\/dev\/[a-z]+[0-9]*([p]?[0-9]*).*$/\1/')

if [ -z "$PARTNUM" ]; then
  ROOTPART=$(echo $ROOTPART | grep -o -E "[^0-9]+")
  PARTNUM=$(echo $ROOTPART | sed -E 's/^\/dev\/[a-z]+([0-9]*).*$/\1/')
fi

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

#rm -f /containers


mv /lib/udev/rules.d/80-net-setup-link.rules /lib/udev/rules.d/80-net-setup-link.rules.bak
ln -s /dev/null /lib/udev/rules.d/80-net-setup-link.rules
touch /home/spr/.spr-setup-done

reboot
