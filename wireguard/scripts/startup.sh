#!/bin/bash
set -a
. /configs/base/config.sh

export DNSIP=$(cat /configs/base/lanip)
if [ -f state/plugins/mesh/enabled ]; then
  exit 0
fi

WIREGUARD_CONFIG=/configs/wireguard/wg0.conf

grep 'PrivateKey = privkey' $WIREGUARD_CONFIG
if [ $? -eq 0 ]; then
	echo "+ wg0.conf template found"
	echo "+ generating new keys for wiregurd"
	PRIVKEY=$(wg genkey)
	PUBKEY=$(echo $PRIVKEY | wg pubkey)
	# only interface
	ESCAPED_PUBKEY=$(printf '%s\n' "$PUBKEY" | sed -e 's/[\/&]/\\&/g')
	cat $WIREGUARD_CONFIG | sed "s/PrivateKey = privkey/PrivateKey = $ESCAPED_PUBKEY/g" | tee  /tmp/wg0.conf
	mv /tmp/wg0.conf $WIREGUARD_CONFIG
fi

. /scripts/up.sh

/wireguard_plugin
