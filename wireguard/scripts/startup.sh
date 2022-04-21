#!/bin/bash
set -a
. /configs/base/config.sh

WIREGUARD_CONFIG=/configs/wireguard/wg0.conf

grep 'PrivateKey = privkey' $WIREGUARD_CONFIG
if [ $? -eq 0 ]; then
	echo "+ wg0.conf template found"
	echo "+ generating new keys for wiregurd"
	PRIVKEY=$(wg genkey)
	PUBKEY=$(echo $PRIVKEY | wg pubkey)
	# only interface
	ESCAPED_PUBKEY=$(printf '%s\n' "$PUBKEY" | sed -e 's/[\/&]/\\&/g')
	cat $WIREGUARD_CONFIG | sed "s/PrivateKey = privkey/PrivateKey = $ESCAPED_PUBKEY/g" | tee $WIREGUARD_CONFIG
fi

ip link add dev wg0 type wireguard
ip addr flush dev wg0
wg setconf wg0 $WIREGUARD_CONFIG
ip link set dev wg0 multicast on
ip link set dev wg0 up


/wireguard_plugin
