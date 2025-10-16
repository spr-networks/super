#!/bin/bash
apt-get update
apt-get -y upgrade
apt-get -y install nftables wireless-regdb conntrack ethtool jq dialog

# install upstream docker
apt-get -y install ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt update
apt-get -y install --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin



if grep --quiet Raspberry /proc/cpuinfo; then
  apt-get -y install linux-modules-extra-raspi
fi

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

# disable dhclient on the WANIF, since we will run our own dhcp
echo network: {config: disabled} > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg

# disable iptables for  docker
echo -e "{\n  \"iptables\": false\n}" > /etc/docker/daemon.json


cp -R base/template_configs configs

 # Find non-conflicting LAN subnet based on current uplink routes
 chmod +x ./base/scripts/find_lan_subnet.sh
 ./base/scripts/find_lan_subnet.sh

 ./configs/scripts/gen_coredhcp_yaml.sh > configs/dhcp/coredhcp.yml

 # Fix interfaces without permanent MAC addresses
 chmod +x ./base/scripts/fix_mac_addresses.sh
 ./base/scripts/fix_mac_addresses.sh

 #generate self signed certificate
 SKIPPASS="-password pass:1234" ./api/scripts/generate-certificate.sh
