#!/bin/bash
set -a
. /configs/base/config.sh

export LANIP=$(cat /configs/base/lanip || echo "192.168.2.1")

# LANIF no longer owns LANIP. Use dummy IF to contain it
ip link add name sprloop type dummy
ip addr add $LANIP/32 dev sprloop
ip link set dev sprloop up

if [ "$LANIF" ]; then
  # set up static routes on LAN interface
  ip link set dev $LANIF up
fi 

if [ "$NFT_OVERRIDE" ]; then
  . /configs/base/nft_rules.sh
else
  # If configured as a leaf router, run those firwall rules instead
  if [ -f state/plugins/mesh/enabled ] && [ -f /plugins/plus/mesh_extension/mesh_rules.sh ]; then
    . /plugins/plus/mesh_extension/mesh_rules.sh
  else
    # Delete mesh bridge in case it exists
    ip link del br0
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
flock /state/base/ready bash -c "sleep inf"
