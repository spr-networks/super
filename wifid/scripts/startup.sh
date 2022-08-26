#!/bin/bash
rm /state/wifi/sta_mac_iface_map/*

for IFACE in $IFACES
do
  hostapd -B /configs/wifi/hostapd_${IFACE}.conf
done

sleep 5

for IFACE in $IFACES
do
  hostapd_cli -B -p /state/wifi/control_${IFACE} -a /scripts/action.sh
done

while true
do
  sleep 100000
done
