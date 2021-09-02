#!/bin/bash

. /configs/config.sh

IP=$1
MAC=$2
# CoreDHCP should be filtering already. Filter for alnum + ._- anyway
NAME=$(echo "$3" | tr -cd '[:alnum:]._-')
NAME=${NAME:=DefaultMissingName}
IFACE=$4
ROUTER=$5
ORIGLAN=$LANIF

#override
LANIF=$IFACE

# set the router IP on the interface
ip addr add $ROUTER/$TINYSLASHMASK dev $IFACE

# Defense in depth, use a static arp entry
arp -i $IFACE -s $IP $MAC

# Use a global exclusive lock to avoid race conditons
exec 100>/tmp/dhcp_script.lock || exit 1
flock 100 || exit 1

custom_groups=$(ls /configs/zones/groups)
all_groups="dns internet lan $custom_groups"

# remove this IP, interface and MAC from all existing interface groups
for N in $all_groups
do
  nft -j list map inet filter ${N}_access | jq -rc '.nftables[1].map | .elem[] | .[] | .concat | if length > 0 then . else empty end | .[0] + " " + .[1] + " " + .[2]' 2>/dev/null | \
    (while read -a VMAP; do  grep -iE "${IP} |${LANIF} |${MAC}" <<< ${VMAP[@]} && nft delete element inet filter ${N}_access { ${VMAP[0]} . ${VMAP[1]} . ${VMAP[2]} : accept }; done )
done


# Allow this MAC address to talk from this IP
SET_ADD() {
  nft add element inet filter ${1}_access { ${IP} . ${LANIF} . ${MAC} : accept }
}

ALLOW_DNS() {
  SET_ADD dns
}

NET_OUTBOUND() {
  SET_ADD internet
}

ALLOW_LAN() {
  SET_ADD lan
}

CREATE_CUSTOM_GROUP() {
  # Map and rule for matching source and destination
  nft add map ${1}_access { type ipv4_addr . ifname . ether_addr : verdict \; }
  nft add rule inet FORWARD ip daddr . oifname . ether daddr vmap @${1}_access ip saddr . iifname . ether saddr vmap @${1}_access
}

# Set up the standard gropu the device is in
if grep -iE "^${MAC}$" /configs/zones/wan_lan_admin
then
  ALLOW_DNS
  NET_OUTBOUND
  ALLOW_LAN
elif grep -iE "^${MAC}$" /configs/zones/wan_lan
then
  ALLOW_DNS
  NET_OUTBOUND
  ALLOW_LAN
elif grep -iE "^${MAC}$" /configs/zones/lan_only
then
  ALLOW_DNS
  ALLOW_LAN
elif grep -iE "^${MAC}$" /configs/zones/wan_only
then
  ALLOW_DNS
  NET_OUTBOUND
elif grep -iE "^${MAC}$" /configs/zones/isolated
then
  echo isolated
fi

# For each custom group the device is in, add it to the verdict map it belongs in
for group in $custom_groups
do
  if grep -iE "^${MAC}$" /configs/zones/groups/${group}; then
    # Create the group if it does not already exist
    nf list map inet ${group}_access 2>/dev/null >/dev/null || CREATE_CUSTOM_GROUP ${group}
    # Add the ip/mac/ifname to the group map it belongs in
    SET_ADD ${group}
  fi
done

#echo Responded to $1 $2 >> /tmp/mac_log.txt

# If a DHCP name was provided, add it to the mappings file
if [ "$NAME" != "DefaultMissingName" ]
then
  #Remove if it already exists. Note, bind mount/overlayfs doesnt support renaming, have to copy in
  sed "/ $NAME.lan/d" /local_mappings > /tmp/mappings_copy
  # Add it back in
  echo "$IP $NAME.lan" >> /tmp/mappings_copy
  cp /tmp/mappings_copy /local_mappings
fi
