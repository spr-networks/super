#!/bin/bash
# Fix interfaces without permanent MAC addresses by setting MACOverride
# This ensures interfaces keep their current MAC across reboots

CONFIG_FILE="/home/spr/super/configs/base/interfaces.json"

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


# Check if interface has a permanent MAC address
has_permanent_mac() {
    local iface="$1"
    local perm_mac

    perm_mac=$(ethtool -P "$iface" 2>/dev/null | awk '{print $3}')

    # Check if permanent MAC is not set or all zeros
    if [[ -z "$perm_mac" ]] || [[ "$perm_mac" == "not" ]] || [[ "$perm_mac" == "00:00:00:00:00:00" ]]; then
        return 1  # No permanent MAC
    fi

    return 0  # Has permanent MAC
}

# Get current MAC address
get_current_mac() {
    local iface="$1"
    ip link show "$iface" 2>/dev/null | grep -oP 'link/ether \K[^ ]+'
}

# Check if interface is a physical hardware device
is_physical_device() {
    local iface="$1"
    # Physical devices have /sys/class/net/<iface>/device
    [ -e "/sys/class/net/$iface/device" ]
}

echo "Checking network interfaces for missing permanent MAC addresses..."

# Create interfaces config if it doesn't exist
if [ ! -f "$CONFIG_FILE" ]; then
    echo "[]" > "$CONFIG_FILE"
fi

# Get all network interfaces
for iface in $(ip -o link show | awk -F': ' '{print $2}' | grep -v '@'); do

    # Validate interface name first
    if ! is_valid_ifname "$iface"; then
        echo "  Warning: Invalid interface name '$iface', skipping" >&2
        continue
    fi

    # Skip loopback
    if [[ "$iface" == "lo" ]]; then
        continue
    fi

    # Skip if interface doesn't exist
    if ! ip link show "$iface" &>/dev/null; then
        continue
    fi

    # Skip virtual interfaces (sprloop, docker, veth, etc.)
    if ! is_physical_device "$iface"; then
        echo "  $iface: Virtual interface, skipping"
        continue
    fi

    # Check if interface has permanent MAC
    if ! has_permanent_mac "$iface"; then
        current_mac=$(get_current_mac "$iface")

        # Validate MAC address format
        if [[ -z "$current_mac" ]] || [[ "$current_mac" == "00:00:00:00:00:00" ]]; then
            echo "  $iface: No permanent MAC and no valid current MAC, skipping"
            continue
        fi

        echo "  $iface: No permanent MAC, preserving current MAC: $current_mac"

        # Update or add interface entry in JSON
        # Use jq with proper escaping via --arg to prevent injection
        if jq -e --arg name "$iface" '.[] | select(.Name == $name)' "$CONFIG_FILE" > /dev/null 2>&1; then
            # Interface exists, update MACOverride
            jq --arg name "$iface" --arg mac "$current_mac" \
               'map(if .Name == $name then .MACOverride = $mac else . end)' \
               "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
        else
            # Interface doesn't exist, add new entry
            jq --arg name "$iface" --arg mac "$current_mac" \
               '. += [{"Name": $name, "Type": "Other", "Enabled": true, "MACOverride": $mac}]' \
               "$CONFIG_FILE" > "${CONFIG_FILE}.tmp" && mv "${CONFIG_FILE}.tmp" "$CONFIG_FILE"
        fi
    else
        echo "  $iface: Has permanent MAC, no action needed"
    fi
done

echo "MAC address fix completed"
