#!/bin/bash
set -a
. /configs/base/config.sh

sysctl net.ipv4.ip_forward=1 net.ipv6.conf.all.forwarding=1

if [ "$LANIF" ]; then
  # set up static routes on LAN interface
  ip addr flush dev $LANIF
  ip addr add $LANIP/24 dev $LANIF
  ip link set dev $LANIF up
else
  if [ "$VLANIF" ]; then
    # If there is no LAN interface, have the wifi/vlan if take the IP
    ip addr flush dev $VLANIF
    ip addr add $LANIP/32 dev $VLANIF
    ip link set dev $VLANIF up
  fi
fi

if [ "$NFT_OVERRIDE" ]; then
  . /configs/base/nft_rules.sh
else
  . /scripts/nft_rules.sh
fi

ret=$?
if [ $ret -neq 0 ]; then
  echo "Failed to load firewall rules, shutting down upstream interface"
  ip link set dev $WANIF down
  exit 1
fi

# traffic accounting
. /scripts/accounting.sh

# performance tuning
/scripts/perftune.sh
while true; do sleep 100000; done
