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


# If on a pi and in setup mode, spin up a default setup AP
PI_SETUP_PENDING=false

# Check if /proc/cpuinfo contains "Raspberry Pi"
if grep -q "Raspberry Pi" /proc/cpuinfo; then
    # Check if /configs/base/.setup_done does not exist
    if [ ! -f /configs/base/.setup_done ]; then
        PI_SETUP_PENDING=true
    fi
fi

if $PI_SETUP_PENDING; then
    hostapd -B /scripts/pi-setup.conf
    hostapd_cli -B -p /state/wifi/control_wlan0 -a /scripts/action-setup.sh
fi

sleep inf
