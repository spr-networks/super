#!/bin/bash
. /configs/base/config.sh
if [ "$RUN_WAN_DHCP" ]; then
  /coredhcp_client -d -i $WANIF -v $RUN_WAN_DHCP_IPV
fi
