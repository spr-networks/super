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

if [ -f /configs/wifi/enable_rust ]; then
  exec /scripts/startup-rust.sh
fi

# Private control plane for validated hostapd operations requested by the API.
# It owns BSS transition command construction so raw hostapd commands are never
# exposed over the external API.
(
  while true; do
    /hostap_dhcp_helper serve
    echo "wifid control exited; restarting in 5 seconds" >&2
    sleep 5
  done
) &

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
  CONF="/configs/wifi/hostapd_${IFACE}.conf"
  MLO_CONF="/configs/wifi/hostapd_${IFACE}_mlo.conf"
  if [ -f "$MLO_CONF" ] && grep -q "^mld_ap=1" "$CONF" 2>/dev/null; then
    echo "Starting MLO hostapd for ${IFACE}: $CONF $MLO_CONF"
    # Clear any wedged ath12k MLD state before starting MLO hostapd
    ip link set "$IFACE" down 2>/dev/null
    ip link set "$IFACE" up 2>/dev/null
    hostapd -B "$CONF" "$MLO_CONF"
  else
    hostapd -B "$CONF"
  fi
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
  rm -f "/state/wifi/failsafe_${IFACE}" 2>/dev/null
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
            CONF="/configs/wifi/hostapd_${IFACE}.conf"
            MLO_CONF="/configs/wifi/hostapd_${IFACE}_mlo.conf"

            # mt7996 workaround to retry after a failed neighbor scan
            if [ -f "$MLO_CONF" ] && grep -q "^mld_ap=1" "$CONF" 2>/dev/null; then
                mlo_recovered=false
                for attempt in 1 2 3; do
                    echo "MLO interface $IFACE down, restart attempt ${attempt}/3"
                    pkill -f "hostapd_${IFACE}.conf"
                    sleep 2
                    ip link set "$IFACE" down 2>/dev/null
                    ip link set "$IFACE" up 2>/dev/null
                    hostapd -B "$CONF" "$MLO_CONF"
                    sleep 5
                    if iw dev "$IFACE" info | grep -q ssid; then
                        echo "MLO interface $IFACE recovered on restart attempt ${attempt}"
                        hostapd_cli -B -p "/state/wifi/control_${IFACE}" -a /scripts/action.sh
                        mlo_recovered=true
                        break
                    fi
                done
                if $mlo_recovered; then
                    continue
                fi
                echo "MLO interface $IFACE did not recover after 3 restarts; falling back to failsafe"
            fi

            echo "Interface $IFACE has failed, starting failsafe"
            pkill -f "hostapd_${IFACE}.conf"

            PHY=$(iw "$IFACE" info | grep -v ssid | grep wiphy | awk '{print $2}')
            BAND=$(iw phy "phy${PHY}" info | grep -m 1 Band | tr ':' ' '| awk '{print $2}')
            if [ "$BAND" == "1" ]; then
                FAILSAFE_TEMPLATE=/scripts/hostapd_failsafe_band1.conf
            elif [ "$BAND" == "2" ]; then
                FAILSAFE_TEMPLATE=/scripts/hostapd_failsafe_band2.conf
            else
                echo "No failsafe template for $IFACE (band '$BAND'), skipping failsafe"
                continue
            fi

            touch "/state/wifi/failsafe_${IFACE}" #mark failsafe started
            FAILSAFE_CONF="/configs/wifi/hostapd_failsafe_${IFACE}.conf"
            cp "$FAILSAFE_TEMPLATE" "$FAILSAFE_CONF"

            sed -i "s/wlan0/${IFACE}/g" "$FAILSAFE_CONF"

            # SSID is user-controlled and may contain / & \ or newlines that break
            # sed s///; drop the template ssid line and write the value literally
            SSID=$(grep -m1 -oP '(?<=^ssid=).*' "/configs/wifi/hostapd_${IFACE}.conf")
            sed -i '/^ssid=/d' "$FAILSAFE_CONF"
            printf 'ssid=%s\n' "$SSID" >> "$FAILSAFE_CONF"

            hostapd -B "$FAILSAFE_CONF"
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
