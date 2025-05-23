#!/bin/bash

# only run this on the pi machines
if ! grep -q "Raspberry Pi" /proc/cpuinfo; then
  exit 0
fi

interface_name_from_band() {
    local interface=$1
    local has_24ghz=0
    local has_5ghz=0
    local PHY=0
    local BAND=0

    PHY=$(iw $interface info | grep -v ssid | grep wiphy | awk '{print $2}')
    BAND=$(iw phy phy$PHY info | grep -m 1 Band | tr ':' ' '| awk '{print $2}')

    if [ "$BAND" == "1" ]; then
        has_24ghz=1
    fi

    if [ "$BAND" == "2" ]; then
        has_5ghz=1
    fi

    # Return interface type based on capability
    if [[ $has_24ghz -eq 1 && $has_5ghz -eq 0 ]]; then
        echo "wlan1"  # Only 2.4GHz
    elif [[ $has_24ghz -eq 0 && $has_5ghz -eq 1 ]]; then
        echo "wlan2"  # Only 5GHz
    elif [[ $has_24ghz -eq 1 && $has_5ghz -eq 1 ]]; then
        echo $interface  # Keep original name for dual-band
    else
        echo ""  # Not a wireless interface or couldn't determine
    fi
}


replace_wlan_interface() {
    local file="$1"
    local new_interface="$2"

    if [ -z "$file" ] || [ -z "$new_interface" ]; then
        echo "Usage: replace_wlan_interface <file_path> <new_interface>"
        return 1
    fi

    if [ ! -f "$file" ]; then
        echo "Error: File '$file' does not exist."
        return 1
    fi

    sed -i "s|ctrl_interface=.*|ctrl_interface=${new_interface}|" "$file"
    sed -i "s|^interface=.*|interface=${new_interface}|" "$file"
}

devices=""
for iface in $(iw dev | grep Interface | grep -v \\. | awk '{print $2}'); do
  #skip built in pi. typically wlan0
  if ! grep -q "DRIVER=brcmfmac" "/sys/class/net/$iface/device/uevent"; then
    if [[ -n "$devices" ]]; then
      devices="$devices "$iface
    else
      devices="$iface"
    fi
  fi
done

declare -A desired_names
counter=0
max_updates=2
for interface in $devices; do

    if [[ $counter -ge $max_updates ]]; then
        break
    fi

    target=$(interface_name_from_band $interface)
    if [[ -n "$target" && "$target" != "$interface" ]]; then
        desired_names[$interface]=$target
        ((counter++))
    fi
done

ifs=(${!desired_names[@]})


for i in "${!ifs[@]}"; do
    ip link set "${ifs[$i]}" down
    ip link set "${ifs[$i]}" name "tmp_${ifs[$i]}"

done

for i in "${!ifs[@]}"; do
    original_if="${ifs[$i]}"
    desired_if="${desired_names["$original_if"]}"
    ip link set "tmp_${original_if}" name "$desired_if"
    ip link set "$desired_if" up # Bring up the interface with its new name

    # this needs to be handled under the API instead
    #mv  "/configs/wifi/hostapd_${original_if}.conf" "/configs/wifi/tmp_hostapd_${original_if}.conf"
    #replace_wlan_interface "/configs/wifi/tmp_hostapd_${original_if}.conf" "${desired_if}"
    #mv "/configs/wifi/tmp_hostapd_${original_if}.conf"  "/configs/wifi/hostapd_${desired_if}.conf"
done
