#!/bin/bash

IFACES=$(curl --unix-socket /state/wifi/apisock http://localhost/interfaces)
RET=$?

while [ $RET -ne 0 ]; do
  sleep 5
  IFACES=$(curl --unix-socket /state/wifi/apisock http://localhost/interfaces)
  RET=$?
done

#clear failsafe state
for IFACE in $IFACES
do
  rm /state/wifi/failsafe_${IFACE} 2>/dev/null
done

for IFACE in $IFACES
do
  hostapd -B /configs/wifi/hostapd_${IFACE}.conf
done

sleep 5

for IFACE in $IFACES
do
  hostapd_cli -B -p /state/wifi/control_${IFACE} -a /scripts/action.sh
done


for IFACE in $IFACES
do
  rm /state/wifi/failsafe_${IFACE}
done


# If on a pi and in setup mode, spin up a default setup AP
if grep -q "Raspberry Pi" /proc/cpuinfo; then
  PI_WLAN=""
  FOUND_PI_BRCMFMAC=false
  PI_SETUP_PENDING=false

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
  fi

fi


check_status() {
    for IFACE in $IFACES
    do
        if iw dev $IFACE info | grep -q ssid; then
            #OK
            :
        else
            touch /state/wifi/failsafe_${IFACE} #mark failsafe started
            echo "Interface $IFACE has failed, starting failsafe"
            pkill -f "hostapd -B /configs/wifi/hostapd_${IFACE}.conf"

            PHY=$(iw $IFACE info | grep -v ssid | grep wiphy | awk '{print $2}')
            BAND=$(iw phy phy$PHY info | grep -m 1 Band | tr ':' ' '| awk '{print $2}')
            if [ "$BAND" == "1" ]; then
                cp /scripts/hostapd_failsafe_band1.conf /configs/wifi/hostapd_failsafe_${IFACE}.conf
            elif [ "$BAND" == "2" ]; then
                cp /scripts/hostapd_failsafe_band2.conf /configs/wifi/hostapd_failsafe_${IFACE}.conf
            fi

            sed -i "s/wlan0/$IFACE/g" /configs/wifi/hostapd_failsafe_${IFACE}.conf

            SSID=$(grep -oP '(?<=^ssid=).*' /configs/wifi/hostapd_${IFACE}.conf)
            sed -i "s/failsafe_ssid/$SSID/g" /configs/wifi/hostapd_failsafe_${IFACE}.conf

            hostapd -B /configs/wifi/hostapd_failsafe_${IFACE}.conf
            hostapd_cli -B -p /state/wifi/control_${IFACE} -a /scripts/action.sh
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
