#!/bin/bash
apt-get update
apt-get upgrade
apt-get install docker.io docker-compose 

touch /etc/cloud/cloud-init.disabled

# get rid of `predictable` interface names to get eth0, eth1, wlan0, wlan1 instead.
mv /lib/udev/rules.d/80-net-setup-link.rules /lib/udev/rules.d/80-net-setup-link.rules.bak
ln -s /dev/null  /lib/udev/rules.d/80-net-setup-link.rules

# Add a bug fix for scatter/gather bugs with USB:
echo "options mt76_usb disable_usb_sg=1" > /etc/modprobe.d/mt76_usb.conf

# do not use systemd-resolvd, we will use our own container later
systemctl disable systemd-resolved
systemctl stop systemd-resolved
rm /etc/resolv.conf
echo "nameserver 1.1.1.1" > /etc/resolv.conf

