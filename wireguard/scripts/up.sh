#!/bin/bash
ip link add dev wg0 type wireguard
ip addr flush dev wg0
wg setconf wg0 $WIREGUARD_CONFIG
ip link set dev wg0 multicast on

# Claim LANIP if no LANIF and no VLANIF 
if [ -z "$LANIF" ] && [ -z "$VLANIF"]; then
  ip addr add $LANIP/32 dev wg0
fi

ip link set dev wg0 up
