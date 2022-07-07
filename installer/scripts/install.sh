#!/bin/bash

# do not use systemd-resolvd, we will use our own container later
systemctl disable systemd-resolved
rm -f /etc/resolv.conf
echo nameserver 1.1.1.1 > /etc/resolv.conf

apt-get update
apt-get -y install docker.io docker-compose nftables linux-modules-extra-raspi

useradd -m -s /bin/bash ubuntu
echo "ubuntu:ubuntu" | chpasswd
usermod -aG sudo ubuntu
echo spr > /etc/hostname
echo "127.0.0.1      spr" >> /etc/hosts

#tbd should be done at startup

touch /etc/cloud/cloud-init.disabled
# delete obsolete packages and any temporary state
mv /lib/udev/rules.d/80-net-setup-link.rules /lib/udev/rules.d/80-net-setup-link.rules.bak
ln -s /dev/null  /lib/udev/rules.d/80-net-setup-link.rules

# Add a bug fix for scatter/gather bugs with USB:
echo "options mt76_usb disable_usb_sg=1" > /etc/modprobe.d/mt76_usb.conf


# disable dhclient on the WANIF, since we will run our own dhcp
#RUN echo "network: {config: disabled}" > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg

# disable iptables for  docker
echo -ne "{\n  \"iptables\": false\n}" > /etc/docker/daemon.json

# SPR setup
mkdir /home/spr
cd /home/spr
cp /tmp/setup.sh .
cp /tmp/run.sh .
git clone https://github.com/spr-networks/super
cd /home/spr/super
cp -R base/template_configs configs

if [ ! -f configs/dhcp/coredhcp.yml ]; then
  ./configs/scripts/gen_coredhcp_yaml.sh > configs/dhcp/coredhcp.yml
  ./configs/scripts/gen_hostapd.sh > configs/wifi/hostapd.conf
  ./configs/scripts/gen_watchdog.sh  > configs/watchdog/watchdog.conf
fi

# cleanup
apt-get autoremove -y && apt-get clean
rm -rf \
    /tmp/* \
    /var/backups/* \
    /var/log/* \
    /var/run/* \
    /var/lib/apt/lists/* \
    ~/.bash_history
