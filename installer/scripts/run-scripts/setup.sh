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

  # ensure system assigns wlan0 to built-in broadcom wifi

  cat > /etc/udev/rules.d/10-network.rules << EOF
ACTION=="add", SUBSYSTEM=="net", DEVPATH=="/devices/platform/soc/*", DRIVERS=="brcmfmac", NAME="wlan0"
  EOF

fi

# disable iptables for  docker
echo -ne "{\n  \"iptables\": false\n}" > /etc/docker/daemon.json

# Suport for Netgear A8000-100PAS
cat > /etc/udev/rules.d/90-usb-3574:6211-mt7921u.rules << EOF
ACTION=="add", 
SUBSYSTEM=="usb", 
ENV{ID_VENDOR_ID}=="3574", 
ENV{ID_MODEL_ID}=="6211", 
RUN+="/usr/sbin/modprobe mt7921u", 
RUN+="/bin/sh -c 'echo 3574 6211 > /sys/bus/usb/drivers/mt7921u/new_id'"
EOF

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
