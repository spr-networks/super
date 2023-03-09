#!/bin/bash

while true
do
  IFACE=$(ip -br link | grep wlan | awk '{print $1}' | head -n 1)
  if [ ! -z $IFACE ]; then
    dhclient -r $IFACE
    dhclient -nw $IFACE
    wpa_supplicant -Dnl80211 -i${IFACE} -c /w.conf
  fi
  sleep 5
done

