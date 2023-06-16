#!/bin/bash

if [ -f "/configs/wifi_uplink/wpa.json" ]; then
  while IFS= read -r iface; do
    wpa_supplicant -B -i "${iface}" -Dnl80211 -c "/configs/wifi_uplink/wpa_${iface}.conf"
  done < <(jq -r '.WPAs[] | select(.Enabled == true) | .Iface' /configs/wifi_uplink/wpa.json)
fi

sleep inf
