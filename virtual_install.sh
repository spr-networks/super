#!/bin/bash

# this can be run like:
# bash -c "$(curl -fsSL https://raw.github.com/spr-networks/super/master/virtual_install.sh)"

install_deps() {
	# install deps
	apt update && \
		apt install -y curl git docker-compose docker.io jq qrencode

	#INSTALL_DIR=/home/spr
	#mkdir $INSTALL_DIR ; cd $INSTALL_DIR
	git clone https://github.com/spr-networks/super.git
	cd super

  # overwrite docker-compose.yml
	cp docker-compose-virt.yml docker-compose.yml
}

if [ ! -f "./docker-compose-virt.yml" ]; then
	install_deps
fi

if [ ! -f configs/base/config.sh ]; then
	cp -R base/template_configs/ configs/
	mv configs/base/virtual-config.sh configs/base/config.sh
	# generate dhcp config
	./configs/scripts/gen_coredhcp_yaml.sh > configs/dhcp/coredhcp.yml
fi

CONTAINER_CHECK=superapi-virt

# docker-compose up -d
docker inspect "$CONTAINER_CHECK" > /dev/null
if [ $? -eq 1 ]; then
	echo "[+] starting spr..."

	docker-compose -f docker-compose-virt.yml pull
	docker-compose -f docker-compose-virt.yml up -d
else
	echo "[+] spr already running"
fi

# external ip

DEV=eth0
EXTERNAL_IP=$(ip addr show dev $DEV | grep inet -m 1|awk '{print $2}'|sed 's/\/.*//g')
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
	echo {\"admin\" : \"$PASSWORD\"} > $SPR_DIR/configs/base/auth_users.json
else
	PASSWORD=$(cat "$SPR_DIR/configs/base/auth_users.json" | jq -r .admin)
fi

echo "[+] generating token..."
TOKEN=$(dd if=/dev/urandom bs=1 count=32 2>/dev/null | base64)
echo "[{\"Name\": \"admin\", \"Token\": \"$TOKEN\", \"Expire\": 0}]" > $SPR_DIR/configs/base/auth_tokens.json

echo "[+] login information:"
echo "================================================"
echo -e "\turl:      http://localhost:$EXTERNAL_PORT/"
echo -e "\tusername: admin"
echo -e "\tpassword: $PASSWORD"
echo -e "\ttoken:    $TOKEN"
echo "================================================"

echo -ne "[~] setup VPN peer? [Y/n] "
read YN
if [ "$YN" == "n" ] || [ "$YN" == "N" ] ; then
	exit
fi

# use localhost
API_HOST="http://0:8000"
TOKEN=$(cat $SPR_DIR/configs/base/auth_tokens.json | jq -r '.[0].Token')

rawurlencode() {
	local string="${1}"
	local strlen=${#string}
	local encoded=""
	local pos c o

	for (( pos=0 ; pos<strlen ; pos++ )); do
		c=${string:$pos:1}
		case "$c" in
			[-_.~a-zA-Z0-9] ) o="${c}" ;;
			* )               printf -v o '%%%02x' "'$c"
		esac
		encoded+="${o}"
	done
	echo "${encoded}"
}

req_GET() {
	RES=$(curl -X GET -s -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" "$API_HOST$1")
}

req_PUT() {
	RES=$(curl -X PUT -s -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" "$API_HOST$1" --data "$2")
}

curl -s --connect-timeout 5 "$API_HOST" > /dev/null
if [ $? -ne 0 ]; then
	echo "[-] failed to connect to $API_HOST"
        exit
fi

echo ""

RES=""
req_GET "/status"
if [ "$RES" != '"Online"' ]; then
	echo "[-] api is down"
	exit
fi

req_GET "/plugins/wireguard/genkey"
PRIVATE_KEY=$(echo $RES | jq -r .PrivateKey)
PUBLIC_KEY=$(echo $RES | jq -r .PublicKey)
echo "[+] pubkey =" $PUBLIC_KEY

ID=$(rawurlencode $PUBLIC_KEY)
URL="/device?identity=$ID"
DATA="{\"Groups\": [\"lan\", \"wan\", \"dns\"], \"WGPubKey\": \"$PUBLIC_KEY\"}"
req_PUT "$URL" "$DATA"

req_GET "/devices"

echo "$RES" | grep "$PUBLIC_KEY" > /dev/null
if [ $? -eq 1 ]; then
	echo "[-] failed to add device"
	exit
fi

DATA="{\"AllowedIPs\": \"\", \"PublicKey\": \"$PUBLIC_KEY\", \"Endpoint\": \"\"}"
echo ">>" $DATA
req_PUT "/plugins/wireguard/peer" "$DATA"

echo RES= $RES

echo "[+] peer added"

ENDPOINT="$EXTERNAL_IP:51280"

CONF="[Interface]"
CONF="$CONF\nPrivateKey = $PRIVATE_KEY"
CONF="$CONF\nAddress = $(echo $RES | jq -r .Interface.Address)"
CONF="$CONF\nDNS = $(echo $RES | jq -r .Interface.DNS)"
CONF="$CONF\n"
CONF="$CONF\n[Peer]"
CONF="$CONF\nPublicKey = $(echo $RES | jq -r .Peer.PublicKey)"
CONF="$CONF\nAllowedIPs = $(echo $RES | jq -r .Peer.AllowedIPs)"
CONF="$CONF\nEndpoint = $(echo $ENDPOINT)"
#CONF="$CONF\nEndpoint = $(echo $RES | jq -r .Peer.Endpoint)"
CONF="$CONF\nPersistentKeepalive = $(echo $RES | jq -r .Peer.PersistentKeepalive)"
CONF="$CONF\nPresharedKey = $(echo $RES | jq -r .Peer.PresharedKey)"

echo -e "[+] config:\n"
echo -e "$CONF" | qrencode -t ansiutf8
echo ""
echo -e "$CONF"
