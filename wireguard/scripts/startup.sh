#!/bin/bash
. /configs/config.sh

#wireguard
if [ "$WIREGUARD_NETWORK" ]; then
  ip link add dev wg0 type wireguard
  ip addr flush dev wg0
  ip addr add $WIREGUARD_NETWORK dev wg0
  wg setconf wg0 /configs/wg0.conf
  #ip route add $WIREGUARD_NETWORK dev wg0
  ip link set dev wg0 up
fi

