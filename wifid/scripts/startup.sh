#!/bin/bash

IFACES=$(curl --unix-socket /state/wifi/apisock http://localhost/interfaces)
RET=$?

while [ $RET -ne 0 ]; do
  sleep 5
  IFACES=$(curl --unix-socket /state/wifi/apisock http://localhost/interfaces)
  RET=$?
done

for IFACE in $IFACES
do
  hostapd -B /configs/wifi/hostapd_${IFACE}.conf
done

sleep 5

for IFACE in $IFACES
do
  hostapd_cli -B -p /state/wifi/control_${IFACE} -a /scripts/action.sh
done

sleep inf
