#!/bin/bash

if [ -f "/configs/wifi_uplink/ifaces" ]; then
  while read -r iface; do
    wpa_supplicant -B -i "$iface" -Dnl80211 -c "/configs/wifi_uplink/wpa_$iface.conf"
  done < "/configs/wifi_uplink/ifaces"
fi

sleep inf
