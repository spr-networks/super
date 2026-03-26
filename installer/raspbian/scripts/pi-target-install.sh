#!/bin/bash
#
# This file runs inside of a qemu aarch64 host
# and finishes the install. It runs as the systemd init target.
# and should not run the per-install specialization (setup.sh)

shopt -s expand_aliases
export DEBIAN_FRONTEND=noninteractive

dhcpcd eth0

# do not use systemd-resolvd, we will use our own container later
systemctl disable systemd-resolved 2>/dev/null || true
rm -f /etc/resolv.conf
echo nameserver 1.1.1.1 > /etc/resolv.conf

# install docker
apt -y install --no-download --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git

# SPR setup
if [ ! -d /home/spr ]; then
  mkdir /home/spr
fi

cd /home/spr
mv /setup.sh .
mv /run.sh .
git clone --depth 1 https://github.com/spr-networks/super

# launch dockerd
mkdir -p /sys/fs/cgroup
mount -t cgroup -o all cgroup /sys/fs/cgroup
mkdir -p /sys/fs/cgroup/devices
mount -t cgroup -o devices devices /sys/fs/cgroup/devices

dockerd --iptables=false --ip6tables=false --bridge=none &
DOCKERD_PID=$!
containerd &

cd /home/spr/super

# wait for dockerd to be ready before pulling
until docker info >/dev/null 2>&1; do sleep 1; done

# pull in default containers
docker compose -f docker-compose.yml  -f dyndns/docker-compose.yml -f ppp/docker-compose.yml -f wifi_uplink/docker-compose.yml pull --quiet


# finish downloaded install
apt-get -y --fix-broken --fix-missing --no-download --no-install-recommends install
dpkg --configure -a

# sync with install.sh and cross-install.sh
apt -y upgrade --no-download
apt -y install --no-download --no-install-recommends nftables wireless-regdb ethtool nano iw fdisk tmux conntrack jq inotify-tools dhcpcd cloud-guest-utils
# Install latest SPR custom kernel + headers from spr-debian-kernel
pushd /tmp
for url in $(wget -qO- "https://api.github.com/repos/spr-networks/spr-debian-kernel/releases/latest" | grep browser_download_url | grep -o 'https://[^"]*\.deb'); do
  wget "$url"
done
dpkg -i linux-image-*.deb linux-headers-*.deb linux-libc-dev_*.deb
rm -f /tmp/*.deb
popd

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

# Set wifi country so RPiOS does not rfkill wireless on boot
raspi-config nonint do_wifi_country US

# Add a bug fix for scatter/gather bugs with USB:
echo "options mt76_usb disable_usb_sg=1" > /etc/modprobe.d/mt76_usb.conf

cd /home/spr/super
cp -R base/template_configs configs

[ -f /lib/udev/rules.d/80-net-setup-link.rules ] && mv /lib/udev/rules.d/80-net-setup-link.rules /lib/udev/rules.d/80-net-setup-link.rules.bak
ln -sf /dev/null /lib/udev/rules.d/80-net-setup-link.rules

echo 'SUBSYSTEM=="net", ACTION=="add", DRIVERS=="rp1", NAME="eth0"' > /etc/udev/rules.d/70-persistent-net.rules

echo 'SUBSYSTEM=="net", ACTION=="add", DEVPATH=="*0001:01:00.0*", NAME="eth0"' > /etc/udev/rules.d/70-persistent-net.rules 

# update sshd config to allow password login
sed -i "s/PasswordAuthentication no/PasswordAuthentication yes/" /etc/ssh/sshd_config
sed -i "s/#PasswordAuthentication yes/PasswordAuthentication yes/" /etc/ssh/sshd_config
# RPiOS disables SSH by default, enable it
systemctl enable ssh

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

mkdir -p /boot/firmware
mount /dev/vda1 /boot/firmware

KVER=$(ls -t /lib/modules/ | head -1)
if [ -n "$KVER" ]; then
  cp /boot/vmlinuz-${KVER} /boot/firmware/kernel8.img
  cp /boot/initrd.img-${KVER} /boot/firmware/initramfs8
  # Pi 5 (2712)
  cp /boot/vmlinuz-${KVER} /boot/firmware/kernel_2712.img
  cp /boot/initrd.img-${KVER} /boot/firmware/initramfs_2712
fi

# we need the pcie-32bit-dma enabled for the mediatek cards
# the other settings are to enable uart for the cm5
if ! grep -q "dtoverlay=pcie-32bit-dma" /boot/firmware/config.txt; then
  cat << EOF >> /boot/firmware/config.txt
dtparam=pciex1
enable_uart=1
dtparam=uart0=on
dtoverlay=uart0
dtparam=uart0_console
pciex4_reset=0
dtoverlay=pcie-32bit-dma
dtoverlay=pciex1-compat-pi5,no-mip
EOF
fi

# regenerate initrd with udev rules in place
update-initramfs -u -k ${KVER:-all}

umount /boot/firmware
rmdir /boot/firmware

# cleanup

#remove linux-firmware rarely used files, that are huge
rm -rf /usr/lib/firmware/mrvl
rm -rf /usr/lib/firmware/mellanox
rm -rf /usr/lib/firmware/qcom
rm -rf /usr/lib/firmware/nvidia
rm -rf /usr/lib/firmware/amdgpu
rm -rf /usr/lib/firmware/nvidia
rm -rf /usr/lib/firmware/i915

#remove snapd
apt purge -y snapd

apt-get autoremove -y && apt-get clean
rm -rf \
    /tmp/* \
    /var/backups/* \
    /var/log/* \
    /var/run/* \
    /var/lib/apt/lists/* \
    ~/.bash_history


set -e
ARCH=$(uname -m)
URL=https://storage.googleapis.com/gvisor/releases/release/latest/${ARCH}
wget ${URL}/runsc ${URL}/runsc.sha512 ${URL}/containerd-shim-runsc-v1 ${URL}/containerd-shim-runsc-v1.sha512
sha512sum -c runsc.sha512
sha512sum -c containerd-shim-runsc-v1.sha512
rm -f *.sha512
chmod a+rx runsc containerd-shim-runsc-v1
sudo mv runsc containerd-shim-runsc-v1 /usr/local/bin



# prepare docker for SPR with nftables

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


# remove script
rm /pi-target-install.sh

# gracefully stop docker so its state is flushed before halt
kill -TERM $DOCKERD_PID
wait $DOCKERD_PID
sync
poweroff -f
