#!/bin/bash

# this can be run like:
# bash -c "$(curl -fsSL https://raw.github.com/spr-networks/super/master/virtual_install.sh)"

if [ $UID -ne 0 ]; then
	echo "[-] run as root or with sudo"
	exit
fi

install_deps() {
	# install deps
	apt update && \
		apt install -y curl git docker-compose docker.io jq qrencode iproute2 wireguard-tools

	git clone https://github.com/spr-networks/super.git
	cd super

	# overwrite docker-compose.yml
	cp docker-compose-virt.yml docker-compose.yml
}

# if not git dir is available
if [ ! -f "./docker-compose-virt.yml" ]; then
	install_deps
fi

# generate default configs
if [ ! -f configs/base/config.sh ]; then
	echo "[+] generating configs..."
	cp -R base/template_configs/ configs/
	mv configs/base/virtual-config.sh configs/base/config.sh
	# use NFT_OVERRIDE for now
	echo "NFT_OVERRIDE=1" >> configs/base/config.sh
	cat base/scripts/nft_rules.sh | sed 's/iif $DOCKERIF /iifname $DOCKERIF /g' > configs/base/nft_rules.sh
	# generate dhcp config
	./configs/scripts/gen_coredhcp_yaml.sh > configs/dhcp/coredhcp.yml
fi

CONTAINER_CHECK=superapi

# pull and start containers
docker inspect "$CONTAINER_CHECK" > /dev/null 2>&1
if [ $? -eq 1 ]; then
	echo "[+] starting spr..."

	docker-compose -f docker-compose-virt.yml pull
	docker-compose -f docker-compose-virt.yml up -d
else
	echo "[+] spr already running"
fi

# external ip
DEV=eth0
DEV=$(ip route get 1.1.1.1 | grep -oP 'dev \K\w+' -m1)
# NOTE if this is not eth0 - change config.sh

EXTERNAL_IP=$(ip addr show dev $DEV | grep -oP "inet \K[0-9\.]+" -m1)
EXTERNAL_PORT=8000
if [ ${#EXTERNAL_IP} -eq 0 ]; then
	echo "[-] failed to get external ip from $DEV"
	echo "[?] fetch from https://ifconfig.me? [y/N] "
	read YN
	if [ "$YN" == "y" ] || [ "$YN" == "Y" ] ; then
		EXTERNAL_IP=$(curl -s "https://ifconfig.me")
	else
		EXTERNAL_IP="127.0.0.1"
	fi
fi

# check spr is running

SPR_DIR=$(docker inspect --format='{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$CONTAINER_CHECK")
if [ ${#SPR_DIR} -eq 0 ]; then
	echo "[-] $CONTAINER_CHECK not running"
	SPR_DIR=/home/spr/super
	exit
fi

# only generate user if init
if [ ! -f $SPR_DIR/configs/base/auth_users.json ]; then
	echo "[+] generating admin password"
	PASSWORD=$(cat /dev/urandom | tr -dc '[:alpha:]' | fold -w ${1:-16} | head -n 1)
	echo "{\"admin\" : \"$PASSWORD\"}" > $SPR_DIR/configs/base/auth_users.json
else
	PASSWORD=$(cat "$SPR_DIR/configs/base/auth_users.json" | jq -r .admin)
fi

echo "[+] generating token..."
TOKEN=$(dd if=/dev/urandom bs=1 count=32 2>/dev/null | base64)
echo "[{\"Name\": \"admin\", \"Token\": \"$TOKEN\", \"Expire\": 0}]" > $SPR_DIR/configs/base/auth_tokens.json

echo "[+] login information:"
echo "================================================"

HOST=$EXTERNAL_IP
if [ $HOST == "127.0.0.1" ]; then
	HOST="sprvirtual"
fi

echo " http tunnel: ssh $HOST -N -L $EXTERNAL_PORT:127.0.0.1:$EXTERNAL_PORT"
echo "         url: http://localhost:$EXTERNAL_PORT/"
echo "    username: admin"
echo "    password: $PASSWORD"
echo "       token: $TOKEN"
echo "================================================"

# NOTE use VPN_PEERS=2 etc on init
echo -ne "[?] setup VPN peer? [Y/n] "
read YN
if [ "$YN" == "n" ] || [ "$YN" == "N" ] ; then
	exit
fi

SERVER_PRIVATE_KEY=$(cat $SPR_DIR/configs/wireguard/wg0.conf | grep PrivateKey|awk '{print $3}')
if [ "$SERVER_PRIVATE_KEY" == "privkey" ]; then
	SERVER_PRIVATE_KEY=$(wg genkey)
fi
SERVER_PUBLIC_KEY=$(echo "$SERVER_PRIVATE_KEY" | wg pubkey)

PRIVATE_KEY=$(wg genkey)
PUBLIC_KEY=$(echo "$PRIVATE_KEY" | wg pubkey)
PRESHARED_KEY=$(wg genpsk)

DHCP_RES=$(curl -s --unix-socket $SPR_DIR/state/dhcp/tinysubnets_plugin http://dhcp/DHCPRequest -X PUT \
	--data "{\"Identifier\": \"$PUBLIC_KEY\"}")

CLIENT_IP=$(echo "$DHCP_RES" | jq -r .IP)
GROUPS_JSON='["lan","wan","dns"]'

echo "[+] adding device $PUBLIC_KEY with ip $CLIENT_IP"
cat > $SPR_DIR/configs/devices/devices.json << EOF
{
 "$PUBLIC_KEY": {
  "Name": "peer1",
  "MAC": "",
  "WGPubKey": "$PUBLIC_KEY",
  "VLANTag": "",
  "RecentIP": "$CLIENT_IP",
  "PSKEntry": {"Type": "","Psk": ""},
  "Groups": $GROUPS_JSON,
  "DeviceTags": []
 }
}
EOF

# wg server config
cat > $SPR_DIR/configs/wireguard/wg0.conf << EOF
[Interface]
PrivateKey = $SERVER_PRIVATE_KEY
ListenPort = 51280

[Peer]
PublicKey = $PUBLIC_KEY
PresharedKey = $PRESHARED_KEY
AllowedIPs = $CLIENT_IP/32, 224.0.0.0/4
EOF

# wg client config
_IFS=$IFS
IFS='\n'
CONF=$(cat << EOF
[Interface]
PrivateKey = $PRIVATE_KEY
Address = $CLIENT_IP
DNS = 192.168.2.1

[Peer]
PublicKey = $SERVER_PUBLIC_KEY
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = $EXTERNAL_IP:51280
PersistentKeepalive = 25
PresharedKey = $PRESHARED_KEY
EOF
)
IFS=$_IFS

echo -e "[+] config:\n"
echo -e "$CONF" | qrencode -t ansiutf8
echo ""
echo -e "$CONF"

# reload wireguard config
docker-compose -f docker-compose-virt.yml restart wireguard
