#!/bin/bash
PI_WLAN=""
FOUND_PI_BRCMFMAC=false
PI_SETUP_PENDING=false

# If on a pi and in setup mode, spin up a default setup AP
if grep -q "Raspberry Pi" /proc/cpuinfo; then

  while read -r line; do
    if echo "$line" | grep -q 'wlan'; then
      PI_WLAN=$(echo "$line" | awk '{print $3}' | tr -d ':')
    fi

    if echo "$line" | grep -q 'driver=brcmfmac'; then
      FOUND_PI_BRCMFMAC=true
    fi

    if [[ -n $PI_WLAN && $FOUND_PI_BRCMFMAC = true ]]; then
      break
    fi
  done <<< "$(lshw -class network)"

  if [[ -n $PI_WLAN && $FOUND_PI_BRCMFMAC = true ]]; then
    # reset PI_WLAN state always, this makes sure setup ap is gone
    # if wifid was restarted
    ip link set dev $PI_WLAN down
    ip addr flush dev $PI_WLAN
    iw dev $PI_WLAN set type managed
    ip link set dev $PI_WLAN up
    # Check if /configs/base/.setup_done does not exist
    if [ ! -f /configs/base/.setup_done ]; then
        PI_SETUP_PENDING=true
    fi
  fi

  if $PI_SETUP_PENDING; then
      cp /scripts/pi-setup.conf /configs/wifi/pi-setup_${PI_WLAN}.conf
      sed -i "s/wlan0/$PI_WLAN/g" /configs/wifi/pi-setup_${PI_WLAN}.conf
      hostapd -B /configs/wifi/pi-setup_${PI_WLAN}.conf
      hostapd_cli -B -p /state/wifi/control_${PI_WLAN} -a /scripts/action-setup.sh
      sleep inf
  fi
fi
