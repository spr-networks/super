#!/bin/bash
. /configs/base/config.sh

IP=$1
MAC=$2
# CoreDHCP should be filtering already. Filter for alnum + ._- anyway
NAME=$(echo "$3" | tr -cd '[:alnum:]._-')
NAME=${NAME:=DefaultMissingName}
IFACE=$4
ROUTER=$5

curl --unix-socket /state/dhcp/apisock http://localhost/dhcpUpdate -X PUT -d "{\"IP\": \"$1\", \"MAC\": \"$2\", \"Name\": \"$NAME\", \"Iface\": \"$IFACE\", \"Router\": \"$ROUTER\"}"
