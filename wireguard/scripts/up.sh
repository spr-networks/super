#!/bin/bash
ip link add dev wg0 type wireguard
ip addr flush dev wg0
wg setconf wg0 $WIREGUARD_CONFIG
ip link set dev wg0 multicast on
ip link set dev wg0 up
