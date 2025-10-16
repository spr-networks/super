#!/bin/bash

# Validate interface name - must be valid Linux interface name
# Max 40 chars, alphanumeric plus: . _ - :
is_valid_ifname() {
    local name="$1"
    # Check length
    if [ ${#name} -gt 40 ]; then
        return 1
    fi
    # Check for valid characters only
    if [[ ! "$name" =~ ^[a-zA-Z0-9._:-]+$ ]]; then
        return 1
    fi
    return 0
}

# Validate MAC address format
is_valid_mac() {
    local mac="$1"
    [[ "$mac" =~ ^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$ ]]
}

IFACE=$1
EVENT=$2
MAC=$3

# Validate interface name from hostapd
if ! is_valid_ifname "$IFACE"; then
    echo "Error: Invalid interface name '$IFACE' from hostapd" >&2
    exit 1
fi

# Validate MAC address
if [ -n "$MAC" ] && ! is_valid_mac "$MAC"; then
    echo "Error: Invalid MAC address '$MAC'" >&2
    exit 1
fi

if [ "$EVENT" = "AP-STA-CONNECTED" ]; then
  VLAN_IFACE="$IFACE"
  /hostap_dhcp_helper add "$VLAN_IFACE" "$MAC"
  curl --unix-socket /state/wifi/apisock http://localhost/reportPSKAuthSuccess -X PUT -d "{\"Iface\": \"$VLAN_IFACE\", \"Event\": \"$EVENT\", \"Mac\": \"$MAC\"}"
elif [ "$EVENT" = "AP-STA-DISCONNECTED" ]; then
  VLAN_IFACE="$IFACE"
  /hostap_dhcp_helper remove "$VLAN_IFACE" "$MAC"
  curl --unix-socket /state/wifi/apisock http://localhost/reportDisconnect -X PUT -d "{\"Iface\": \"$VLAN_IFACE\", \"Event\": \"$EVENT\", \"Mac\": \"$MAC\"}"
elif [ "$EVENT" = "AP-STA-POSSIBLE-PSK-MISMATCH" ]; then
   TYPE=$4
   REASON=$5
   curl --unix-socket /state/wifi/apisock http://localhost/reportPSKAuthFailure -X PUT -d "{\"Type\": \"$TYPE\", \"Mac\": \"$MAC\", \"Reason\": \"$REASON\"}"
fi
