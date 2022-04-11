#!/bin/bash
. /configs/base/config.sh

#wireguard
if [ "$WIREGUARD_NETWORK" ]; then
  ip link add dev wg0 type wireguard
  ip addr flush dev wg0
  ip addr add $WIREGUARD_NETWORK dev wg0
  wg setconf wg0 /configs/wireguard/wg0.conf
  #ip route add $WIREGUARD_NETWORK dev wg0
  ip link set dev wg0 up
fi

# haxxy way to put the pubkey in env for go instead of parsing the conf
export LANIP=$LANIP
#export WIREGUARD_PORT=$WIREGUARD_PORT
/wireguard_plugin
