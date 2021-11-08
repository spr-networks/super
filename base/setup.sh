#!/bin/bash
apt-get update
apt-get -y upgrade
apt-get -y install docker.io docker-compose 

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
echo -e "tmpfs\t/tmp\ttmpfs\tdefaults,noatime,nosuid,size=100m\t0\t0\ntmpfs\t/var/tmp\ttmpfs\tdefaults,noatime,nosuid,size=100m\t0\t0\ntmpfs\t/var/log\ttmpfs\tdefaults,noatime,nosuid,mode=0755,size=100m\t0\t0\ntmpfs\t/run\ttmpfs\tdefaults,noatime,nosuid,mode=0755,size=10m\t0\t0\ntmpfs\t/var/run\ttmpfs\tdefaults,noatime,nosuid,mode=0755,size=10m\t0\t0\n" >> /etc/fstab

# disable dhclient on the WANIF, since we will run our own dhcp
echo network: {config: disabled} > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg

# disable iptables for  docker
echo -e "{\n  \"iptables\": false\n}" > /etc/docker/daemon.json
