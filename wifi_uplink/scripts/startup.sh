#!/bin/bash

if [ -f "/configs/wifi_uplink/wpa.json" ]; then
  while IFS= read -r iface; do
    wpa_supplicant -B -i "${iface}" -Dnl80211 -c "/configs/wifi_uplink/wpa_${iface}.conf"
    dhclient -nw ${iface}
  done < <(jq -r '.WPAs[].Iface' /configs/wifi_uplink/wpa.json)
fi
  
sleep inf
