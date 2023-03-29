#!/bin/bash

# script check everything is setup correct on the host system
# run base/setup.sh on the host
# returns: 0 if everything is ok, else 1
# TODO check version

GOT_ERROR=0
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

error() {
    echo -e "${RED}- fail:${NC} $1"
    GOT_ERROR=1
}

if [ -f "/.dockerenv" ]; then
    error "this script should run on host system"
    exit
fi

echo "~ checking packages"
packages="docker.io docker-compose nftables wireless-regdb conntrack linux-modules-extra-raspi"
for p in $packages; do
    dpkg -V "$p" >/dev/null
    if [ $? -ne 0 ]; then
        error "missing package $p"
        break
    fi
done

echo "~ checking config files"

if [[ ! -f "/etc/modprobe.d/mt76_usb.conf" ]]; then
    error "missing mt76 modprobe config"
fi

if [[ ! -L "/lib/udev/rules.d/80-net-setup-link.rules" ]]; then
    error "missing udev rules"
fi

grep -q "disabled" "/etc/cloud/cloud.cfg.d/99-disable-network-config.cfg" >/dev/null
if [ $? -ne 0 ]; then
    error "missing cloud.d config"
fi

grep -q '"iptables": false' /etc/docker/daemon.json >/dev/null
if [ $? -ne 0 ]; then
    error "missing docker iptables config"
fi

apt-cache show linux-modules-extra-raspi | grep -Eq "Version: 5.15.0.(1005\.5)" 2>/dev/null
if [ $? -eq 0 ]; then
    error "installed mt76 module does not work for 5ghz. be sure to run on the 2.4ghz freq band"
fi

# show summary
if [ $GOT_ERROR -eq 0 ]; then
    echo -e "${GREEN}+ success${NC} host system looks good"
    exit 0
else
    exit 1
fi
