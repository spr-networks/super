#!/bin/bash
. /configs/base/config.sh

JSON=/configs/base/interfaces.json
STATE=/state/dhcp-client/
WPA_STATE=/state/wifi_uplink

function dhcp_iface() {
  name=$1
  echo "Running coredhcp_client for ${name}"

  /coredhcp_client -d -i ${name} -v ${RUN_WAN_DHCP_IPV} -lf ${STATE}/coredhcp-${name}.json
  GATEWAY=$(jq -r '.Routers[0] // empty' ${STATE}/coredhcp-${name}.json 2>/dev/null)
  if [ -z "$GATEWAY" ]
  then
    echo "Failed, trying dhclient for ${name}"
    # NOTE: apparmor on ubuntu wants /var/run/dhclient*.lease
    rm /var/run/dhclient_${name}.lease
    dhclient -lf /var/run/dhclient_${name}.lease ${name}
    GATEWAY=$(grep -E "^\s+option routers" /var/run/dhclient_${name}.lease  | awk '{print $3}' | cut -d ',' -f1 | cut -d ';' -f1)
  fi
  # write the gateway router IP to disk
  echo $GATEWAY > /state/dhcp-client/gateway.${name}
}

function run_dhcp() {
  # clear out the dhcp states
  rm ${STATE}/coredhcp*.json
  rm /var/run/dhclient_*.lease
  rm ${STATE}/gateway.*


  if [ "$RUN_WAN_DHCP" ]; then

    _=$(ip link show br0)
    ret=$?
    if [ "$ret" -eq "0" ]
    then
      # Reset WANIF to original MAC address
      # This is useful for the mesh plugin,
      # which changes the mac address temporarily.

      ip link set dev $WANIF down
      ip link set dev $WANIF address $(ethtool -P $WANIF | awk '{print $3}')
      ip link set dev $WANIF up

      #we do not dhcp for mesh mode for now. all done
      sleep inf
    fi


    # will use WANIF if configs/base/interfaces.json is not available
    names=$(jq -r '.[] | select(.Type == "Uplink" and .Enabled and (.Subtype == null or .Subtype != "pppup") and (.DisableDHCP == null or .DisableDHCP != true)) | .Name' "$JSON")
    [ -z "$names" ] && names="$WANIF"
    for name in ${names[@]}; do
        dhcp_iface ${name} &
    done
    wait

    # Handle static IP assignments
    jq -r '.[] | select(.Type == "Uplink" and .Enabled and .DisableDHCP == true) | "\(.Name) \(.IP) \(.Router)"' $JSON |
    while IFS= read -r entry; do
        read -r name ip router <<< "$entry"
        echo "Set $name with address $ip route $router"
        # Assign IP address and router.
        ip addr flush dev $name
        ip addr add $ip dev $name
        ip route add 0.0.0.0/0 via $router dev $name
    done
  fi
}

function config_sig() {
  {
    jq -r '.[] | select(.Type == "Uplink" and .Enabled and (.Subtype == null or .Subtype != "pppup")) | "\(.Name) \(.Subtype) \(.DisableDHCP) \(.IP) \(.Router)"' "$JSON" 2>/dev/null | sort
    cat ${WPA_STATE}/status.* 2>/dev/null
  } | md5sum | cut -d' ' -f1
}

mkdir -p ${WPA_STATE}
LAST_SIG=""

while true; do
  SIG=$(config_sig)
  if [ "$SIG" != "$LAST_SIG" ]; then
    LAST_SIG="$SIG"
    killall -1 coredhcp_client 2>/dev/null
    killall -1 dhclient 2>/dev/null
    run_dhcp
    continue
  fi
  inotifywait -q -t 300 -e modify -e close_write -e moved_to -e create "$(dirname $JSON)" ${WPA_STATE} >/dev/null 2>&1
  ret=$?
  if [ "$ret" -ne "0" ] && [ "$ret" -ne "2" ]; then
    sleep 5
  fi
done
