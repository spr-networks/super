#!/bin/bash
CONTAINERS="api base dhcp dhcp_client dns wifid multicast_udp_proxy ppp wireguard"
for C in $CONTAINERS
do
  docker pull ghcr.io/spr-networks/super_${C}:latest
done


