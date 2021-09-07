#!/bin/bash

IFACE=$1
EVENT=$2
MAC=$3

if [ "$EVENT" = "AP-STA-CONNECTED" ]; then
  VLAN_ID=$(hostapd_cli -p /tmp/control sta $MAC | grep vlan_id | cut -c 9-)
  VLAN_IFACE=$IFACE.$VLAN_ID
  /hostap_dhcp_helper add $VLAN_IFACE $MAC
  echo $MAC > /sta_mac_iface_map/$VLAN_IFACE
elif [ "$EVENT" = "AP-STA-DISCONNECTED" ]; then
  VLAN_ID=$(hostapd_cli -p /tmp/control sta $MAC | grep vlan_id | cut -c 9-)
  VLAN_IFACE=$IFACE.$VLAN_ID
  /hostap_dhcp_helper remove $VLAN_IFACE $MAC
  rm /sta_mac_iface_map/$VLAN_IFACE
fi

