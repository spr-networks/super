#!/bin/bash

. /configs/base/config.sh

IP=$1
MAC=$2
# CoreDHCP should be filtering already. Filter for alnum + ._- anyway
NAME=$(echo "$3" | tr -cd '[:alnum:]._-')
NAME=${NAME:=DefaultMissingName}
IFACE=$4
ROUTER=$5

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
# If not a WiFi/VLAN VIF then do do not match on the interface
SEARCHSTRING="${IP} |${MAC}"
if grep -iE $VLANSIF <<< $IFACE; then
  SEARCHSTRING="${IP} |${IFACE} |${MAC}"
fi

for N in $all_groups
do
  nft -j list map inet filter ${N}_access | jq -rc '.nftables[1].map | .elem[] | .[] | .concat | if length > 0 then . else empty end | .[0] + " " + .[1] + " " + .[2]' 2>/dev/null | \
    (while read -a VMAP; do  grep -iE "$SEARCHSTRING" <<< ${VMAP[@]} && nft delete element inet filter ${N}_access { ${VMAP[0]} . ${VMAP[1]} . ${VMAP[2]} : accept }; done )
done


for N in $all_groups
do
  nft -j list map inet filter ${N}_mac_src_access | jq -rc '.nftables[1].map | .elem[] | .[] | .concat | if length > 0 then . else empty end | .[0] + " " + .[1] + " " + .[2]' 2>/dev/null | \
    (while read -a VMAP; do  grep -iE "$SEARCHSTRING" <<< ${VMAP[@]} && nft delete element inet filter ${N}_mac_src_access { ${VMAP[0]} . ${VMAP[1]} . ${VMAP[2]} : accept }; done )
done

for N in $all_groups
do
  nft -j list map inet filter ${N}_dst_access | jq -rc '.nftables[1].map | .elem[] | .[] | .concat | if length > 0 then . else empty end | .[0] + " " + .[1] + " " + .[2]' 2>/dev/null | \
    (while read -a VMAP; do  grep -iE "$SEARCHSTRING" <<< ${VMAP[@]} && nft delete element inet filter ${N}_dst_access { ${VMAP[0]} . ${VMAP[1]} : continue }; done )
done

# Allow this MAC address to talk from this IP
SET_ADD() {
  nft add element inet filter ${1}_access { ${IP} . ${IFACE} . ${MAC} : accept }
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
  # First group matches sources, which include a MAC address
  nft add map inet filter ${1}_mac_src_access { type ipv4_addr . ifname . ether_addr : verdict \; }
  # Second group matches destinations
  nft add map inet filter ${1}_dst_access { type ipv4_addr . ifname : verdict \; }
  nft insert rule inet filter FORWARD ip daddr . oifname vmap @${1}_dst_access ip saddr . iifname . ether saddr vmap @${1}_mac_src_access
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
    nft list map inet filter ${group}_dst_access 2>/dev/null >/dev/null || CREATE_CUSTOM_GROUP ${group}
    # Add the ip/mac/ifname to the group map it belongs in
    # This comes first, continue
    nft add element inet filter ${group}_dst_access { ${IP} . ${IFACE} : continue }
    # This comes second, accept immediately in this case
    nft add element inet filter ${group}_mac_src_access { ${IP} . ${IFACE} . ${MAC} : accept }
  fi
done

#echo Responded to $1 $2 >> /tmp/mac_log.txt

# If a DHCP name was provided, add it to the mappings file
if [ "$NAME" != "DefaultMissingName" ]
then
  #Remove if it already exists. Note, bind mount/overlayfs doesnt support renaming, have to copy in
  sed "/ $NAME.lan/d" /state/dns/local_mappings > /tmp/mappings_copy
  # Add it back in
  echo "$IP $NAME.lan" >> /tmp/mappings_copy
  cp /tmp/mappings_copy /state/dns/local_mappings
fi
