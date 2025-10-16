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

/scripts/update_iface_names.sh

IFACES=$(curl --unix-socket /state/wifi/apisock http://localhost/interfaces)
RET=$?

while [ $RET -ne 0 ]; do
  sleep 5
  IFACES=$(curl --unix-socket /state/wifi/apisock http://localhost/interfaces)
  RET=$?
done

IFACES_VIRTUAL=$(curl --unix-socket /state/wifi/apisock http://localhost/interfaces_virtual_bss)

# Note: Interface names from API have been validated and sanitized in the Go code

#clear failsafe state
for IFACE in $IFACES
do
  # Validate each interface name
  if ! is_valid_ifname "$IFACE"; then
    echo "Warning: Invalid interface name '$IFACE' from API, skipping" >&2
    continue
  fi
  rm "/state/wifi/failsafe_${IFACE}" 2>/dev/null
done

for IFACE in $IFACES
do
  # Validate each interface name
  if ! is_valid_ifname "$IFACE"; then
    echo "Warning: Invalid interface name '$IFACE' from API, skipping" >&2
    continue
  fi
  hostapd -B "/configs/wifi/hostapd_${IFACE}.conf"
done

sleep 5

for IFACE in $IFACES
do
  # Validate each interface name
  if ! is_valid_ifname "$IFACE"; then
    echo "Warning: Invalid interface name '$IFACE' from API, skipping" >&2
    continue
  fi
  hostapd_cli -B -p "/state/wifi/control_${IFACE}" -a /scripts/action.sh
done

for IFACE in $IFACES_VIRTUAL
do
  # Validate each interface name
  if ! is_valid_ifname "$IFACE"; then
    echo "Warning: Invalid interface name '$IFACE' from API, skipping" >&2
    continue
  fi
  hostapd_cli -B -p "/state/wifi/control_${IFACE}" -a /scripts/action.sh
done

for IFACE in $IFACES
do
  # Validate each interface name
  if ! is_valid_ifname "$IFACE"; then
    continue
  fi
  rm "/state/wifi/failsafe_${IFACE}"
done



check_status() {
    for IFACE in $IFACES
    do
        # Validate each interface name
        if ! is_valid_ifname "$IFACE"; then
            echo "Warning: Invalid interface name '$IFACE' in check_status, skipping" >&2
            continue
        fi

        if iw dev "$IFACE" info | grep -q ssid; then
            #OK
            :
        else
            touch "/state/wifi/failsafe_${IFACE}" #mark failsafe started
            echo "Interface $IFACE has failed, starting failsafe"
            pkill -f "hostapd -B /configs/wifi/hostapd_${IFACE}.conf"

            PHY=$(iw "$IFACE" info | grep -v ssid | grep wiphy | awk '{print $2}')
            BAND=$(iw phy "phy${PHY}" info | grep -m 1 Band | tr ':' ' '| awk '{print $2}')
            if [ "$BAND" == "1" ]; then
                cp /scripts/hostapd_failsafe_band1.conf "/configs/wifi/hostapd_failsafe_${IFACE}.conf"
            elif [ "$BAND" == "2" ]; then
                cp /scripts/hostapd_failsafe_band2.conf "/configs/wifi/hostapd_failsafe_${IFACE}.conf"
            fi

            sed -i "s/wlan0/${IFACE}/g" "/configs/wifi/hostapd_failsafe_${IFACE}.conf"

            SSID=$(grep -oP '(?<=^ssid=).*' "/configs/wifi/hostapd_${IFACE}.conf")
            sed -i "s/failsafe_ssid/${SSID}/g" "/configs/wifi/hostapd_failsafe_${IFACE}.conf"

            hostapd -B "/configs/wifi/hostapd_failsafe_${IFACE}.conf"
            hostapd_cli -B -p "/state/wifi/control_${IFACE}" -a /scripts/action.sh
        fi
    done
}

sleep 60
check_status

while true
do
    sleep 300
    check_status
done

sleep inf
