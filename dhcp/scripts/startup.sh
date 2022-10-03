#!/bin/bash
# Do not run DHCPD in mesh mode
if [ ! -f state/plugins/mesh/enabled ]; then
  /coredhcpd -c /configs/dhcp/coredhcp.yml
fi
