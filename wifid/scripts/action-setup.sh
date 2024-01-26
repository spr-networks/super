#!/bin/bash

IFACE=$1
EVENT=$2
MAC=$3

if [ "$EVENT" = "AP-STA-CONNECTED" ]; then
  VLAN_IFACE=$IFACE
  /hostap_dhcp_helper add $VLAN_IFACE $MAC
  curl --unix-socket /state/wifi/apisock http://localhost/reportPSKAuthSuccess -X PUT -d "{\"Iface\": \"$VLAN_IFACE\", \"Event\": \"$EVENT\", \"Mac\": \"$MAC\"}"
elif [ "$EVENT" = "AP-STA-DISCONNECTED" ]; then
  VLAN_IFACE=$IFACE
  /hostap_dhcp_helper remove $VLAN_IFACE $MAC
  curl --unix-socket /state/wifi/apisock http://localhost/reportDisconnect -X PUT -d "{\"Iface\": \"$VLAN_IFACE\", \"Event\": \"$EVENT\", \"Mac\": \"$MAC\"}"
elif [ "$EVENT" = "AP-STA-POSSIBLE-PSK-MISMATCH" ]; then
   TYPE=$4
   REASON=$5
   curl --unix-socket /state/wifi/apisock http://localhost/reportPSKAuthFailure -X PUT -d "{\"Type\": \"$TYPE\", \"Mac\": \"$MAC\", \"Reason\": \"$REASON\"}"
fi
