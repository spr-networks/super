#!/bin/bash
. /configs/base/config.sh

JSON=/configs/base/interfaces.json
STATE=/state/dhcp-client/

function run_dhcp() {
  # clear out the dhcp states
  rm -f "${STATE}"/coredhcp*.json
  rm -f /var/run/dhclient_*.lease
  rm -f "${STATE}"/gateway.*
  rm -f "${STATE}"/dns.*


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
    # Iterate over the array and run dhclient for each name
    for name in ${names[@]}; do
        echo "Running coredhcp_client for ${name}"

        /coredhcp_client -d -i "${name}" -v "${RUN_WAN_DHCP_IPV}" -lf "${STATE}/coredhcp-${name}.json"
        GATEWAY=$(jq -r .Routers[0] < "${STATE}/coredhcp-${name}.json")
        # Extract DNS servers from DHCP response
        DNS_SERVERS=$(jq -r '.DNSServers[]' < "${STATE}/coredhcp-${name}.json" 2>/dev/null | tr '\n' ' ')
        # check for an IP, if no IP, run dhclient as a fallback
        ping 1.1.1.1 -c 1 -W 3
        ret=$?
        if [ "$ret" -ne "0" ]
        then
          echo "Failed, trying dhclient for ${name}"
          # NOTE: apparmor on ubuntu wants /var/run/dhclient*.lease
          rm /var/run/dhclient_${name}.lease
          dhclient -lf /var/run/dhclient_${name}.lease ${name}
          GATEWAY=$(grep -E "^\s+option routers" /var/run/dhclient_${name}.lease  | awk '{print $3}' | cut -d ',' -f1 | cut -d ';' -f1)
          # Extract DNS servers from dhclient lease
          DNS_SERVERS=$(grep -E "^\s+option domain-name-servers" /var/run/dhclient_${name}.lease | awk '{for(i=3;i<=NF;i++) print $i}' | tr -d ',;' | tr '\n' ' ')
        fi
        # write the gateway router IP to disk
        echo "$GATEWAY" > "/state/dhcp-client/gateway.${name}"
        # write DNS servers to disk for captive portal use
        if [ -n "$DNS_SERVERS" ]; then
          echo "$DNS_SERVERS" > "/state/dhcp-client/dns.${name}"
        fi
    done

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

run_dhcp

while true; do
  inotifywait -e modify "$JSON"
  killall -1 coredhcp_client
  killall -1 dhclient
  run_dhcp
done
