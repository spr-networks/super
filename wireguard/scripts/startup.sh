#!/bin/bash
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

#wireguard
if [ "$WIREGUARD_NETWORK" ]; then
  ip link add dev wg0 type wireguard
  ip addr flush dev wg0
  ip addr add $WIREGUARD_NETWORK dev wg0
  wg setconf wg0 $WIREGUARD_CONFIG
  #ip route add $WIREGUARD_NETWORK dev wg0
  ip link set dev wg0 up
fi

# haxxy way to put the pubkey in env for go instead of parsing the conf
export LANIP=$LANIP
#export WIREGUARD_PORT=$WIREGUARD_PORT
/wireguard_plugin
