#!/bin/bash
CONTAINERS="api base dhcp dhcp_client dns frontend multicast_udp_proxy ppp super-plugin-lookup wifid wireguard"
for C in $CONTAINERS
do
  docker pull ghcr.io/spr-networks/super_${C}:latest
done


