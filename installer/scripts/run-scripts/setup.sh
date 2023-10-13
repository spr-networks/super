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

apt-get -y install linux-firmware

# Update mediatek firmware
pushd /root/mt76/
git pull
cp -R /root/mt76/firmware/. /lib/firmware/mediatek/
popd

if grep --quiet Raspberry /proc/cpuinfo; then
  apt-get -y install linux-modules-extra-raspi

  # ensure system assigns wlan0 to built-in broadcom wifi

  cat > /etc/udev/rules.d/10-network.rules << EOF
ACTION=="add", SUBSYSTEM=="net", DEVPATH=="/devices/platform/soc/*", DRIVERS=="brcmfmac", NAME!="wlan0", RUN+="/etc/udev/wlan0-swap.sh %k"
EOF

  cat > /etc/udev/wlan0-swap.sh << 'EOF'
#!/bin/bash

# Check if the script received an argument
if [ "$#" -ne 1 ]; then
    echo "Usage: $0 interface_name"
    exit 1
fi

# Check if the wlan0 interface exists
if ip link show wlan0 > /dev/null 2>&1; then
    # If wlan0 exists, rename it to wlan_tmp
    ip link set wlan0 down
    ip link set wlan0 name wlan_tmp
    wlan_exists=true
else
    wlan_exists=false
fi

# Rename the given interface to wlan0
ip link set "$1" down
ip link set "$1" name wlan0
ip link set wlan0 up

if $wlan_exists; then
    # If wlan0 existed, rename wlan_tmp to the given interface and bring it back up
    ip link set wlan_tmp down
    ip link set wlan_tmp name "$1"
    ip link set "$1" up
fi
EOF

  chmod +x /etc/udev/wlan0-swap.sh

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

# Suport for Netgear A8000-100PAS
cat > /etc/udev/rules.d/90-usb-0846:9060-mt7921u.rules << EOF
ACTION=="add",
SUBSYSTEM=="usb",
ENV{ID_VENDOR_ID}=="0846",
ENV{ID_MODEL_ID}=="9060",
RUN+="/usr/sbin/modprobe mt7921u",
RUN+="/bin/sh -c 'echo 0846 9060 > /sys/bus/usb/drivers/mt7921u/new_id'"
EOF


#try docker-compose pull, else, load the offline containers

shopt -s expand_aliases
if ! which docker-compose > /dev/null 2>&1; then
    # Set an alias for docker-compose if it's missing
    alias docker-compose='docker compose'
fi


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
