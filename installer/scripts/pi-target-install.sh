#!/bin/bash
shopt -s expand_aliases
export DEBIAN_FRONTEND=noninteractive

# finish downloaded install
apt-get -y --fix-broken --fix-missing --no-download install
dpkg --configure -a

apt -y upgrade --no-download
apt -y install --no-download nftables wireless-regdb ethtool git nano iw cloud-utils fdisk tmux conntrack
# install docker and buildx
apt -y install --no-download docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

touch /mnt/fs/etc/cloud/cloud-init.disabled
# slow commands
apt-get -y purge cloud-init

# do not use systemd-resolvd, we will use our own container later
systemctl disable systemd-resolved
rm -f /etc/resolv.conf
echo nameserver 1.1.1.1 > /etc/resolv.conf

useradd -m -s /bin/bash ubuntu
echo "ubuntu:ubuntu" | chpasswd
usermod -aG sudo ubuntu
passwd --expire ubuntu
# so that cd ~spr works
useradd -m -s /bin/true spr
echo spr > /etc/hostname
echo "127.0.0.1      spr" >> /etc/hosts

# disable dhclient on the WANIF, since we will run our own dhcp
# dont use this
echo "network: {config: disabled}" > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg

# Add a bug fix for scatter/gather bugs with USB:
echo "options mt76_usb disable_usb_sg=1" > /etc/modprobe.d/mt76_usb.conf

# SPR setup
if [ ! -d /home/spr ]; then
  mkdir /home/spr
fi

cd /home/spr
cp /tmp/setup.sh .
cp /tmp/run.sh .
git clone --depth 1 https://github.com/spr-networks/super
cd /home/spr/super
cp -R base/template_configs configs

if [ ! -f configs/dhcp/coredhcp.yml ]; then
  ./configs/scripts/gen_coredhcp_yaml.sh > configs/dhcp/coredhcp.yml
fi

mv /lib/udev/rules.d/80-net-setup-link.rules /lib/udev/rules.d/80-net-setup-link.rules.bak
ln -s /dev/null /lib/udev/rules.d/80-net-setup-link.rules

# update sshd config to allow password login
sed -i "s/PasswordAuthentication no/PasswordAuthentication yes/" /etc/ssh/sshd_config
sed -i "s/#PasswordAuthentication yes/PasswordAuthentication yes/" /etc/ssh/sshd_config



cat > /etc/udev/rules.d/10-network.rules << EOF
ACTION=="add", SUBSYSTEM=="net", SUBSYSTEMS=="sdio", DRIVERS=="brcmfmac", NAME!="wlan0", RUN+="/etc/udev/wlan0-swap.sh %k"
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

# cleanup
#apt-get autoremove -y && apt-get clean
#rm -rf \
#    /tmp/* \
#    /var/backups/* \
#    /var/log/* \
#    /var/run/* \
#    /var/lib/apt/lists/* \
#    ~/.bash_history

### TBD: move spr-environment.sh to /boot/ . VFAT = easy to modify
###   wizard?
###
