#!/bin/bash

IFACE=$1
EVENT=$2

if [ "$EVENT" = "CONNECTED" ]; then
  mkdir -p /state/wifi_uplink
  echo "${EVENT} $(date +%s)" > "/state/wifi_uplink/status.${IFACE}"
fi
