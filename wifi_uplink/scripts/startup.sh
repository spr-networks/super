#!/bin/bash

mkdir -p /state/wifi_uplink
rm -f /state/wifi_uplink/status.*

start_iface() {
  iface=$1
  for attempt in $(seq 1 12); do
    if wpa_supplicant -B -i "${iface}" -Dnl80211 -c "/configs/wifi_uplink/wpa_${iface}.conf"; then
      for cli_attempt in $(seq 1 5); do
        sleep 1
        wpa_cli -B -i "${iface}" -p "/var/run/wpa_supplicant_${iface}" -a /scripts/wpa_action.sh && break
      done
      return
    fi
    sleep 5
  done
}

if [ -f "/configs/wifi_uplink/wpa.json" ]; then
  while IFS= read -r iface; do
    start_iface "${iface}" &
  done < <(jq -r '.WPAs[] | select(.Enabled == true) | .Iface' /configs/wifi_uplink/wpa.json)
fi

sleep inf
