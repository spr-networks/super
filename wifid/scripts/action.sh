#!/bin/bash

IFACE=$1
EVENT=$2
MAC=$3

if [ "$EVENT" = "AP-STA-CONNECTED" ]; then
  VLAN_ID=$(hostapd_cli -p /state/wifi/control_${IFACE} sta $MAC | grep vlan_id | cut -c 9-)
  VLAN_IFACE=$IFACE.$VLAN_ID
  /hostap_dhcp_helper add $VLAN_IFACE $MAC
  curl --unix-socket /state/wifi/apisock http://localhost/reportPSKAuthSuccess -X PUT -d "{\"Iface\": \"$VLAN_IFACE\", \"Event\": \"$EVENT\", \"Mac\": \"$MAC\"}"
elif [ "$EVENT" = "AP-STA-DISCONNECTED" ]; then
  VLAN_ID=$(hostapd_cli -p /state/wifi/control_${IFACE} sta $MAC | grep vlan_id | cut -c 9-)
  VLAN_IFACE=$IFACE.$VLAN_ID
  /hostap_dhcp_helper remove $VLAN_IFACE $MAC
  curl --unix-socket /state/wifi/apisock http://localhost/reportDisconnect -X PUT -d "{\"Iface\": \"$VLAN_IFACE\", \"Event\": \"$EVENT\", \"Mac\": \"$MAC\"}"
elif [ "$EVENT" = "AP-STA-POSSIBLE-PSK-MISMATCH" ]; then
   TYPE=$4
   REASON=$5
   curl --unix-socket /state/wifi/apisock http://localhost/reportPSKAuthFailure -X PUT -d "{\"Type\": \"$TYPE\", \"Mac\": \"$MAC\", \"Reason\": \"$REASON\", \"Iface\": \"$IFACE\"}"
fi
