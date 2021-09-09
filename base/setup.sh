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

# constrain journal size
echo -e "[Journal]\n\nSystemMaxUse=50m\nSystemMaxFileSize=10M" > /etc/systemd/journald.conf 
# mount logs as tmpfs
echo -e "tmpfs    /tmp    tmpfs    defaults,noatime,nosuid,size=100m    0 0\ntmpfs    /var/tmp    tmpfs    defaults,noatime,nosuid,size=30m    0 0\ntmpfs    /var/log    tmpfs    defaults,noatime,nosuid,mode=0755,size=100m    0 0\ntmpfs    /var/run    tmpfs    defaults,noatime,nosuid,mode=0755,size=2m    0 0\n" >> /etc/fstab


