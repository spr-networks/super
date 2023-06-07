#!/bin/sh

# comment below to DISABLE ssh, API from the Upstream Interface
UPSTREAM_SERVICES_ENABLE=1

# Uncomment below to use SPR without wifi,
#  as a VPN gateway for example
#VIRTUAL_SPR=1

WANIF=eth0
RUN_WAN_DHCP=true
RUN_WAN_DHCP_IPV=4
# Uncomment the next line if a second ethernet port goes to wired LAN
#LANIF=eth1

DOCKERNET=172.17.0.0/16
DOCKERIF=docker0

WIREGUARD_PORT=51280
