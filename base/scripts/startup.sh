#!/bin/bash
set -a
. /configs/base/config.sh

sysctl net.ipv4.ip_forward=1

if [ "$LANIF" ]; then
  # set up static routes on LAN interface
  ip addr flush dev $LANIF
  ip addr add $LANIP/24 dev $LANIF
  ip link set dev $LANIF up
else
  # If there is no LAN interface, have a dummy interface claim  it
  ip link add name sprloop type dummy
  ip addr add $LANIP/32 dev sprloop
  ip link set dev sprloop up
fi

if [ "$NFT_OVERRIDE" ]; then
  . /configs/base/nft_rules.sh
else
  # If configured as a leaf router, run those firwall rules instead
  if [ -f state/plugins/mesh/enabled ] && [ -f plugins/plus/mesh/mesh_rules.sh ]; then
    . plugins/plus/mesh/mesh_rules.sh
  else
    . /scripts/nft_rules.sh
  fi
fi

ret=$?
if [ $ret -ne 0 ]; then
  echo "Failed to load firewall rules, shutting down upstream interface"
  ip link set dev $WANIF down
  exit 1
fi

# traffic accounting
. /scripts/accounting.sh

# performance tuning
/scripts/perftune.sh

#mark initialization as finished
flock /state/base/ready bash -c "while true; do sleep 100000; done"
