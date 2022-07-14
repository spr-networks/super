#!/bin/bash
### additional SPR setup

set -a
. /spr-environment.sh

ip link set $WANIF up
dhclient $WANIF
dpkg-reconfigure openssh-server

echo {\"${ADMIN_USER}\" : \"${ADMIN_PASSWORD}\"} > /home/spr/super/configs/base/auth_users.json


# Resize to full disk
ROOTPART=$(df | grep " /$" | awk '{print $1}')
PART=$(echo $ROOTPART | grep -o -E "[^0-9]+")
PARTNUM=$(echo $ROOTPART | grep -o -E "[0-9]+")
growpart $PART $PARTNUM
resize2fs $ROOTPART

touch /home/spr/.spr-setup-done
#rm -rf /containers
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y dist-upgrade
apt-get -y install docker.io docker-compose nftables linux-modules-extra-raspi

# disable iptables for  docker
echo -ne "{\n  \"iptables\": false\n}" > /etc/docker/daemon.json


cd /containers
for x in `ls *.tar`
do
  docker import --change "ENTRYPOINT $(cat $x.entry)" $x $(echo ghcr.io/spr-networks/$x | rev | cut -c 5- | rev)
done

rm -f /containers

mv /lib/udev/rules.d/80-net-setup-link.rules /lib/udev/rules.d/80-net-setup-link.rules.bak
touch /lib/udev/rules.d/80-net-setup-link.rules
chattr +i /lib/udev/rules.d/80-net-setup-link.rules

reboot
