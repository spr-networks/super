#!/bin/sh
# This variant of the configuration is for running
# without a wifi AP. See https://www.supernetworks.org/pages/docs/virtual_spr

# Run in VIRTUAL mode (bridge network rather than host mode)
VIRTUAL_SPR=1
#comment below to DISABLE ssh, API from the Upstream Interface
UPSTREAM_SERVICES_ENABLE=1
WANIF=eth0
RUN_WAN_DHCP=true
RUN_WAN_DHCP_IPV=4
LANIP=192.168.2.1
DNSIP=$LANIP
TINYNETSTART=192.168.2.4
TINYNETSTOP=192.168.2.255
TINYNETMASK=255.255.255.252
TINYSLASHMASK=30
DOCKERNET=172.17.0.0/16
DOCKERIF=docker0
WIREGUARD_PORT=51280
