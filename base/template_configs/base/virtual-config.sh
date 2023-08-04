#!/bin/sh
# This variant of the configuration is for running
# without a wifi AP. See https://www.supernetworks.org/pages/docs/virtual_spr

# Run in VIRTUAL mode (bridge network rather than host mode)
VIRTUAL_SPR=1

# uncomment below to allow API connections from the internet, and modify docker-compose.yml to no longer bind to 127.0.0.1
# WARNING: the API will likely be vulnerable to MITM attacks
#VIRTUAL_SPR_API_INTERNET=1

#comment below to DISABLE ssh, API from the docker network altogether
UPSTREAM_SERVICES_ENABLE=1
WANIF=eth0
RUN_WAN_DHCP=true
RUN_WAN_DHCP_IPV=4

DOCKERNET=172.17.0.0/16
DOCKERIF=docker0

WIREGUARD_PORT=51280
