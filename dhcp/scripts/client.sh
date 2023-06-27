#!/bin/bash
. /configs/base/config.sh

JSON=/configs/base/interfaces.json
STATE=/state/dhcp-client/

if [ "$RUN_WAN_DHCP" ]; then
  # Reset WANIF to original MAC address
  # This is useful for the mesh plugin,
  # which changes the mac address temporarily.
  ip link set dev $WANIF down
  ip link set dev $WANIF address $(ethtool -P $WANIF | awk '{print $3}')
  ip link set dev $WANIF up


  # will use WANIF if configs/base/interfaces.json is not available
  names=$(jq -r '.[] | select(.Type == "Uplink" and .Enabled and (.Subtype == null or .Subtype != "pppup") and (.DisableDHCP == null or .DisableDHCP != true)) | .Name' $JSON || echo $WANIF)
  # Iterate over the array and run dhclient for each name
  for name in ${names[@]}; do
      echo "Running coredhcp_client for ${name}"

      /coredhcp_client -d -i ${name} -v ${RUN_WAN_DHCP_IPV} -lf ${STATE}/coredhcp-${name}.json
      GATEWAY=$(jq -r .Routers[0] <  ${STATE}/coredhcp-${name}.json)
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
      fi
      # write the gateway router IP to disk
      echo $GATEWAY > /state/dhcp-client/gateway.${name}
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
sleep inf
