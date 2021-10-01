#!/bin/bash
. /configs/config.sh

sysctl net.ipv4.ip_forward=1 net.ipv6.conf.all.forwarding=1

if [ "$LANIF" ]; then
  # set up static routes on LAN interface
  ip addr flush dev $LANIF
  ip addr add $LANIP/24 dev $LANIF
  ip link set dev $LANIF up
else
  # If there is no LAN interface, have the wifi/vlan if take the IP
  ip addr flush dev $VLANIF
  ip addr add $LANIP/32 dev $VLANIF
  ip link set dev $VLANIF up
fi

#wireguard
if [ "$WIREGUARD_NETWORK" ]; then
  ip link add dev wg0 type wireguard
  ip addr flush dev wg0
  ip addr add $WIREGUARD_NETWORK dev wg0
  ip link set dev wg0 up
fi

. /scripts/nft_rules.sh

# performance tuning
/scripts/perftune.sh
bash
