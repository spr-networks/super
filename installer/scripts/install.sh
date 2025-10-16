#!/bin/bash

# do not use systemd-resolvd, we will use our own container later
systemctl disable systemd-resolved

systemctl disable systemd-networkd-wait-online.service
systemctl mask systemd-networkd-wait-online.service

rm -f /etc/resolv.conf
echo nameserver 1.1.1.1 > /etc/resolv.conf

# Docker's buildkit has evolved to require buildx and as of 23.04 buildkit
# is no longer sufficient to work with a complex docker-compose file.
# Install the upstream docker packages then.
apt-get update
apt-get -y install ca-certificates curl gnupg dhcpcd5
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository to Apt sources:
echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update

#linux-modules-extra-raspi is cleaned up now
#https://bugs.launchpad.net/ubuntu/+source/linux-raspi/+bug/2048862
# NOTE: also check pi-cross-install when making updates
apt-get -y install --download-only linux-firmware
apt-get -y install --no-install-recommends nftables wireless-regdb ethtool git nano iw cloud-utils fdisk tmux conntrack jq inotify-tools dialog
# install docker and buildx
apt-get -y install --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

useradd -m -s /bin/bash ubuntu
echo "ubuntu:ubuntu" | chpasswd
usermod -aG sudo ubuntu
passwd --expire ubuntu
# so that cd ~spr works
useradd -m -s /bin/true spr
echo spr > /etc/hostname
echo "127.0.0.1      spr" >> /etc/hosts

#update mediatek firmware
git clone --depth 1 --no-checkout https://github.com/openwrt/mt76 /root/mt76
# d6611d015efd725706ee285308dedbff24b9ea03 is last confirmed good firmware
cd /root/mt76
git fetch --depth 1 origin 65bbd4c394a9d51f1ca5a0531166c22ff07d4e56
git checkout 65bbd4c394a9d51f1ca5a0531166c22ff07d4e56

cp -R /root/mt76/firmware/. /lib/firmware/mediatek/

# set up ntpdate
cat > /tmp/ntpdate.service << EOF
[Unit]
Description=NTP Time Synchronization

[Service]
ExecStart=/usr/sbin/ntpdate time.nist.gov

[Install]
WantedBy=multi-user.target

[Timer]
OnBootSec=5min
OnUnitActiveSec=1d
EOF

cp /tmp/ntpdate.service /usr/lib/systemd/system/
ln -s /usr/lib/systemd/system/ntpdate.service /etc/systemd/system/multi-user.target.wants/ntpdate.service

# disable dhclient on the WANIF, since we will run our own dhcp
# dont use this
touch /etc/cloud/cloud-init.disabled
apt-get -y purge cloud-init
rm /etc/ssh/sshd_config.d/60-cloudimg-settings.conf
echo "network: {config: disabled}" > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg

# Add a bug fix for scatter/gather bugs with USB:
echo "options mt76_usb disable_usb_sg=1" > /etc/modprobe.d/mt76_usb.conf


cat > /etc/docker/daemon.json << EOF
{
    "iptables": false,
    "runtimes": {
        "runsc": {
            "path": "/usr/local/bin/runsc",
            "runtimeArgs": [
              "--host-uds=all",
              "--platform=kvm"
             ]
        },
        "runsc-systrap": {
            "path": "/usr/local/bin/runsc",
            "runtimeArgs": [
              "--host-uds=all",
              "--platform=systrap"
             ]
        }
    }
}
EOF

set -e
ARCH=$(uname -m)
URL=https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}
pushd /tmp
wget ${URL}/runsc ${URL}/runsc.sha512 ${URL}/containerd-shim-runsc-v1 ${URL}/containerd-shim-runsc-v1.sha512
sha512sum -c runsc.sha512
sha512sum -c containerd-shim-runsc-v1.sha512
rm -f *.sha512
chmod a+rx runsc containerd-shim-runsc-v1
mv runsc containerd-shim-runsc-v1 /usr/local/bin
popd


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

mv /lib/udev/rules.d/80-net-setup-link.rules /lib/udev/rules.d/80-net-setup-link.rules.bak
ln -s /dev/null /lib/udev/rules.d/80-net-setup-link.rules

# update sshd config to allow password login
sed -i "s/PasswordAuthentication no/PasswordAuthentication yes/" /etc/ssh/sshd_config
sed -i "s/#PasswordAuthentication yes/PasswordAuthentication yes/" /etc/ssh/sshd_config

# cleanup
apt-get autoremove -y && apt-get clean
rm -rf \
    /tmp/* \
    /var/backups/* \
    /var/log/* \
    /var/run/* \
    /var/lib/apt/lists/* \
    ~/.bash_history

### TBD: move spr-environment.sh to /boot/ . VFAT = easy to modify
###   wizard?
###
