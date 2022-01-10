#!/bin/bash

IFACE=$1
EVENT=$2
MAC=$3

if [ "$EVENT" = "AP-STA-CONNECTED" ]; then
  VLAN_ID=$(hostapd_cli -p /state/wifi/control sta $MAC | grep vlan_id | cut -c 9-)
  VLAN_IFACE=$IFACE.$VLAN_ID
  /hostap_dhcp_helper add $VLAN_IFACE $MAC
  echo $MAC > /state/wifi/sta_mac_iface_map/$VLAN_IFACE
  curl --unix-socket /state/wifi/apisock http://localhost/reportPSKAuthSuccess -X PUT -d "{\"Iface\": \"$VLAN_IFACE\", \"Event\": \"$EVENT\", \"Mac\": \"$MAC\"}" 
elif [ "$EVENT" = "AP-STA-DISCONNECTED" ]; then
  VLAN_ID=$(hostapd_cli -p /state/wifi/control sta $MAC | grep vlan_id | cut -c 9-)
  VLAN_IFACE=$IFACE.$VLAN_ID
  /hostap_dhcp_helper remove $VLAN_IFACE $MAC
  rm /state/wifi/sta_mac_iface_map/$VLAN_IFACE
elif [ "$EVENT" = "AP-STA-POSSIBLE-PSK-MISMATCH" ]; then
   TYPE=$4
   REASON=$4
   curl --unix-socket /state/wifi/apisock http://localhost/reportPSKAuthFailure -X PUT -d "{\"Type\": \"$TYPE\", \"Mac\": \"$MAC\", \"Reason\": \"$REASON\"}"
fi
