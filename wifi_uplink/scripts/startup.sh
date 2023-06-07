#!/bin/bash

for iface in `cat configs/wifi_uplink/ifaces`
do
  wpa_supplicant -B -i ${iface} -Dnl80211 -c /configs/wifi_uplink/wpa_${iface}.conf
done

sleep inf
