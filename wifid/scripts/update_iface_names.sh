#!/bin/bash

# only run this on the pi machines
if ! grep -q "Raspberry Pi" /proc/cpuinfo; then
  exit 0
fi

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

# Get the band (1 for 2.4GHz, 2 for 5GHz) for an interface
get_band() {
    local interface="$1"
    local PHY
    PHY=$(iw "$interface" info 2>/dev/null | grep -v ssid | grep wiphy | awk '{print $2}')
    if [ -z "$PHY" ]; then
        echo ""
        return
    fi
    local BAND
    BAND=$(iw phy "phy${PHY}" info 2>/dev/null | grep -m 1 Band | tr ':' ' '| awk '{print $2}')
    echo "$BAND"
}

# Get the driver for an interface
get_driver() {
    local interface="$1"
    if [ -f "/sys/class/net/${interface}/device/uevent" ]; then
        grep "DRIVER=" "/sys/class/net/${interface}/device/uevent" | cut -d'=' -f2
    else
        echo ""
    fi
}

# Collect all wireless interfaces and categorize them
declare -A interface_info
declare -a all_interfaces

for iface in $(iw dev | grep Interface | grep -v \\. | awk '{print $2}'); do
    # Validate interface name first
    if ! is_valid_ifname "$iface"; then
        echo "Warning: Skipping interface '$iface' - invalid name (contains special characters or too long)"
        continue
    fi

    driver=$(get_driver "$iface")
    band=$(get_band "$iface")

    interface_info["${iface}_driver"]=$driver
    interface_info["${iface}_band"]=$band
    all_interfaces+=("$iface")
done

# Exit if no valid interfaces found
if [ ${#all_interfaces[@]} -eq 0 ]; then
    echo "No valid wireless interfaces found"
    exit 0
fi

# Categorize interfaces by type
declare -a builtin_ifaces      # brcmfmac
declare -a dbdc_24ghz          # mt7915e band 1
declare -a dbdc_5ghz           # mt7915e band 2
declare -a other_ifaces        # everything else (USB dongles, etc)

for iface in "${all_interfaces[@]}"; do
    driver="${interface_info[${iface}_driver]}"
    band="${interface_info[${iface}_band]}"

    if [[ "$driver" == "brcmfmac" ]]; then
        # Built-in Raspberry Pi WiFi
        builtin_ifaces+=("$iface")
    elif [[ "$driver" == "mt7915e" ]]; then
        # MediaTek DBDC card (PCIe) - these get priority for wlan1/wlan2
        if [[ "$band" == "1" ]]; then
            dbdc_24ghz+=("$iface")
        elif [[ "$band" == "2" ]]; then
            dbdc_5ghz+=("$iface")
        else
            # mt7915e but couldn't determine band
            other_ifaces+=("$iface")
        fi
    else
        # Everything else: USB dongles, other cards, etc
        other_ifaces+=("$iface")
    fi
done

# Build the desired mapping: what SHOULD be in each slot
declare -A slot_for_interface  # interface -> desired slot

# wlan0: Built-in WiFi (brcmfmac)
if [ ${#builtin_ifaces[@]} -gt 0 ]; then
    builtin="${builtin_ifaces[0]}"
    slot_for_interface["$builtin"]="wlan0"
fi

# wlan1: MediaTek DBDC 2.4GHz (mt7915e, band 1)
if [ ${#dbdc_24ghz[@]} -gt 0 ]; then
    mt_24="${dbdc_24ghz[0]}"
    slot_for_interface["$mt_24"]="wlan1"
fi

# wlan2: MediaTek DBDC 5GHz (mt7915e, band 2)
if [ ${#dbdc_5ghz[@]} -gt 0 ]; then
    mt_5="${dbdc_5ghz[0]}"
    slot_for_interface["$mt_5"]="wlan2"
fi

# wlan3+: Additional interfaces
next_slot=3
for iface in "${other_ifaces[@]}"; do
    slot_for_interface["$iface"]="wlan${next_slot}"
    ((next_slot++))
done

# Build rename map: only rename interfaces that are NOT in the correct slot
declare -A rename_map

for iface in "${all_interfaces[@]}"; do
    target="${slot_for_interface[$iface]}"

    # Only add to rename_map if the interface is not already at its target name
    if [[ -n "$target" && "$iface" != "$target" ]]; then
        rename_map["$iface"]="$target"
    fi
done

# If there are no renames needed, exit
if [ ${#rename_map[@]} -eq 0 ]; then
    echo "No interface renames needed"
    exit 0
fi

# Display rename plan
echo "Interface rename plan:"
for iface in "${!rename_map[@]}"; do
    driver="${interface_info[${iface}_driver]}"
    target="${rename_map[$iface]}"
    echo "  $iface ($driver) -> $target"
done

# First pass: rename all interfaces to temporary names
# Use a safe temporary naming scheme: tmp0, tmp1, tmp2, etc.
declare -A temp_map  # original_name -> temp_name
temp_counter=0

echo "Step 1: Moving interfaces to temporary names..."
for iface in "${!rename_map[@]}"; do
    temp_name="tmp${temp_counter}"
    temp_map["$iface"]="$temp_name"

    if ip link show "$iface" &>/dev/null; then
        echo "  $iface -> $temp_name"
        if ! ip link set "$iface" down; then
            echo "  Error: Failed to bring down $iface"
            continue
        fi
        if ! ip link set "$iface" name "$temp_name"; then
            echo "  Error: Failed to rename $iface to $temp_name"
            ip link set "$iface" up  # Try to restore
            continue
        fi
    else
        echo "  Warning: Interface $iface not found, skipping"
    fi
    ((temp_counter++))
done

# Second pass: rename from temporary names to final names
echo "Step 2: Moving interfaces to final names..."
for iface in "${!rename_map[@]}"; do
    target="${rename_map[$iface]}"
    temp_name="${temp_map[$iface]}"

    if [ -z "$temp_name" ]; then
        continue  # This interface failed in step 1
    fi

    if ip link show "$temp_name" &>/dev/null; then
        echo "  $temp_name -> $target"
        if ! ip link set "$temp_name" name "$target"; then
            echo "  Error: Failed to rename $temp_name to $target"
            continue
        fi
        if ! ip link set "$target" up; then
            echo "  Warning: Failed to bring up $target"
        fi
    else
        echo "  Warning: Interface $temp_name not found, skipping"
    fi
done

echo "Interface renaming complete"
