#!/bin/bash
. /configs/base/config.sh
if [ "$PPPIF" ]; then
   if [ "$PPP_VLANID" ]; then
     ip link add link $PPPIF name $PPPIF.$PPP_VLANID type vlan id $PPP_VLANID
     ip link set up dev $PPPIF.$PPP_VLANID
   fi
  ip link set up dev $PPPIF
  /usr/sbin/pppd nodetach call $PPP_PROVIDER 2>&1
fi
