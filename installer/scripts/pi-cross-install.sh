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
STATE='-o Dir::Cache="/mnt/fs/var/cache/apt" -o Dir::State="/mnt/fs/var/lib/apt" -o Dir::Etc::Sourcelist="/mnt/fs/etc/apt/sources.list" -o Dir::Etc::Sourceparts="/mnt/fs/etc/apt/sources.list.d" -o Dir::State::Lists="/mnt/fs/var/lib/apt/lists" -o APT::Architecture="arm64" -o APT::Architectures="arm64"'
alias apty="apt-get $STATE"

# Docker's buildkit has evolved to require buildx and as of 23.04 buildkit
# is no longer sufficient to work with a complex docker-compose file.
# Install the upstream docker packages then.
apty update
apty -y install ca-certificates curl gpg
install -m 0755 -d /etc/apt/keyrings
install -m 0755 -d /mnt/fs/etc/apt/keyrings
# palce on target for later
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /mnt/fs/etc/apt/keyrings/docker.gpg
#needed on host `apt`
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /mnt/fs/etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository to Apt sources:
echo \
  "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /mnt/fs/etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  tee /mnt/fs/etc/apt/sources.list.d/docker.list > /dev/null
apty update

# NOTE: also check /scripts/install.sh when making updates
apty -y upgrade --download-only
apty -y install linux-firmware
apty -y install --download-only --no-install-recommends nftables wireless-regdb ethtool git nano iw cloud-utils fdisk tmux conntrack jq inotify-tools
# install docker and buildx
apty -y install --download-only --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

apty -y install --download-only --no-install-recommends r8125-dkms linux-headers-raspi
