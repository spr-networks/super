#!/bin/bash

DIR_TEST=/code

while true
do
  IFACE=$(ip -br link | grep wlan | awk '{print $1}' | head -n 1)
  if [ ! -z $IFACE ]; then

    echo "+ IFACE= $IFACE"

    dhclient -r $IFACE
    dhclient -nw $IFACE
    wpa_supplicant -B -Dnl80211 -i${IFACE} -c /sta4.conf
  fi
  sleep 5
done
