#!/bin/bash
. /configs/config.sh

sysctl net.ipv4.ip_forward=1 net.ipv6.conf.all.forwarding=1
. /scripts/iptables.sh

# set up static routes on LAN
ip addr flush dev $LANIF
ip addr add $LANIP/24 dev $LANIF
ip link set dev $LANIF up

#wireguard
#ip link add dev wg0 type wireguard

# performance tuning
/scripts/perftune.sh
bash
