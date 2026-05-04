#!/bin/bash

# This script runs apt onto the mounted image,
# to download everything without needing `qemu`
#
shopt -s expand_aliases

export DEBIAN_FRONTEND=noninteractive
# for host
apt-get update
apt-get install -y --no-install-recommends curl ca-certificates gpg git

#for cross
STATE='-o Dir::Cache="/mnt/fs/var/cache/apt" -o Dir::State="/mnt/fs/var/lib/apt" -o Dir::Etc::Sourceparts="/mnt/fs/etc/apt/sources.list.d" -o Dir::State::Lists="/mnt/fs/var/lib/apt/lists" -o Dir::Etc::TrustedParts="/mnt/fs/etc/apt/trusted.gpg.d" -o APT::Architecture="arm64" -o APT::Architectures="arm64"'
alias apty="apt-get $STATE"

# DEB822 source files use absolute Signed-By paths — copy target keyrings to
# matching host paths so cross-apt signature verification succeeds.
# RPiOS/Debian sources use both /etc/apt/keyrings/ and /usr/share/keyrings/.
install -m 0755 -d /etc/apt/keyrings
cp /mnt/fs/etc/apt/keyrings/* /etc/apt/keyrings/ 2>/dev/null || true
cp /mnt/fs/etc/apt/trusted.gpg.d/* /etc/apt/trusted.gpg.d/ 2>/dev/null || true
cp /mnt/fs/usr/share/keyrings/* /usr/share/keyrings/ 2>/dev/null || true

# Docker's buildkit has evolved to require buildx and as of 23.04 buildkit
# is no longer sufficient to work with a complex docker-compose file.
# Install the upstream docker packages then.
apty update
# Only download — never install arm64 packages on the x86 host
apty -y install --download-only --no-install-recommends ca-certificates curl gpg
install -m 0755 -d /etc/apt/keyrings
install -m 0755 -d /mnt/fs/etc/apt/keyrings
# place on target for later
rm -f /mnt/fs/etc/apt/keyrings/docker.gpg /etc/apt/keyrings/docker.gpg
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /mnt/fs/etc/apt/keyrings/docker.gpg
#needed on host `apt`
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /mnt/fs/etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository to Apt sources:
echo \
  "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  "$(. /mnt/fs/etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  tee /mnt/fs/etc/apt/sources.list.d/docker.list > /dev/null
apty update

# NOTE: also check /scripts/install.sh when making updates
apty -y upgrade --download-only
apty -y install --download-only linux-firmware
apty -y install --download-only --no-install-recommends nftables wireless-regdb ethtool git nano iw fdisk tmux conntrack jq inotify-tools dhcpcd cloud-guest-utils tcpdump iperf3 systemd-timesyncd
# install docker and buildx
apty -y install --download-only --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

