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

custom_ipset_groups=$(ls /configs/zones/groups)
ipset_groups="dns internet lan $custom_ipset_groups"
# remove interface from all existing interface groups
for N in $ipset_groups
do
  line=$(ipset list "${N}_iface_access" | grep -i $LANIF | head -n 1)
  while : ; do
    ipset del "${N}_iface_access" $line
    line=$(ipset list "${N}_iface_access" | grep -i $LANIF | head -n 1)
    test -z $line && break
  done
done

#remove the mac from all existing groups
for N in $ipset_groups
do
  line=$(ipset list "${N}_mac_access" | grep -i $MAC | head -n 1)
  while : ; do
    ipset del "${N}_mac_access" $line
    line=$(ipset list "${N}_mac_access" | grep -i $MAC | head -n 1)
    test -z $line && break
  done
done

#do we need to remove the IP as well? hmm

# Allow this MAC address to talk from this IP
IPSET_ADD() {
  ipset add ${1}_iface_access ${IP}/${TINYSLASHMASK},${LANIF}
  ipset add ${1}_mac_access ${IP},${MAC}
}
ALLOW_DNS() {
  IPSET_ADD dns
}

NET_OUTBOUND() {
  IPSET_ADD internet
}

ALLOW_LAN() {
  IPSET_ADD lan
}

CREATE_CUSTOM_GROUP() {
  ipset create ${1}_iface_access hash:net,iface
  ipset create ${1}_mac_access hash:ip,mac

  # Want to verify both the interface and the mac, need a chain with 1 entry to combine two src,src matches
  # since ipset takes only the first match for src
  iptables -N ${1}_iface_access
  iptables -A ${1}_iface_access -m set --match-set ${1}_iface_access src,src -j ACCEPT
  iptables -I FORWARD -m set --match-set ${1}_mac_access src,src -m set --match-set ${1}_iface_access dst,dst -j ${1}_iface_access
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

# For each custom group the device is in, add it to the ipset if it belongs
for group in $custom_ipset_groups
do
  if grep -iE "^${MAC}$" /configs/zones/groups/${group}; then
    # Create the group if it does not already exist
    ipset list ${group}_iface_access >/dev/null || CREATE_CUSTOM_GROUP ${group}
    # Add the ip/mac to the ipsets it belongs in
    IPSET_ADD ${group}
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
