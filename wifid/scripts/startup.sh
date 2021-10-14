#!/bin/bash
rm /state/wifi/sta_mac_iface_map/*
(sleep 5 && hostapd_cli -B -p /state/wifi/control -a /scripts/action.sh) &
#hostapd /configs/wifi/hostapd.conf
while true; do sleep 100; done

