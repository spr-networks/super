#!/bin/bash

# this can be run like:
# bash -c "$(curl -fsSL https://raw.github.com/spr-networks/super/master/virtual_install.sh)"
# run with SKIP_VPN=1 to skip vpn peer setup
# run with SKIP_DNS_BLOCK=1 to disable dns block, default is hosts,ads
# add custom blocks with DNS_BLOCK=hosts,ads,facebook
# if configs are already setup it'll only show the login info
# for a clean reset:
# docker-compose -f docker-compose-virt.yml down && rm -rf configs && ./virtual_install.sh

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
# verify its a public ip address
EXTERNAL_IP=$(ip addr show dev $DEV | grep -oP "inet \K[0-9\.]+" -m1)
EXTERNAL_IP=$(echo "$EXTERNAL_IP" | grep -P '^(?!^0\.)(?!^10\.)(?!^100\.6[4-9]\.)(?!^100\.[7-9]\d\.)(?!^100\.1[0-1]\d\.)(?!^100\.12[0-7]\.)(?!^127\.)(?!^169\.254\.)(?!^172\.1[6-9]\.)(?!^172\.2[0-9]\.)(?!^172\.3[0-1]\.)(?!^192\.0\.0\.)(?!^192\.0\.2\.)(?!^192\.88\.99\.)(?!^192\.168\.)(?!^198\.1[8-9]\.)(?!^198\.51\.100\.)(?!^203.0\.113\.)(?!^22[4-9]\.)(?!^23[0-9]\.)(?!^24[0-9]\.)(?!^25[0-5]\.)(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5]))$')
EXTERNAL_PORT=8000
if [ ${#EXTERNAL_IP} -eq 0 ]; then
        echo "[-] failed to get external ip for $DEV"
        echo -n "[?] fetch from https://ifconfig.me? [Y/n] "
        read YN
        if [ "$YN" == "n" ] || [ "$YN" == "N" ] ; then
                EXTERNAL_IP="127.0.0.1"
                echo "[+] setting endpoint to $EXTERNAL_IP, change this manually in your config"
        else
                EXTERNAL_IP=$(curl -s "https://ifconfig.me")
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
if [ ! -f $SPR_DIR/configs/auth/auth_users.json ]; then
	echo "[+] generating admin password"
	PASSWORD=$(cat /dev/urandom | tr -dc '[:alpha:]' | fold -w ${1:-16} | head -n 1)
	echo "{\"admin\" : \"$PASSWORD\"}" > $SPR_DIR/configs/auth/auth_users.json

	echo "[+] generating token..."
	TOKEN=$(dd if=/dev/urandom bs=1 count=32 2>/dev/null | base64)
	echo "[{\"Name\": \"admin\", \"Token\": \"$TOKEN\", \"Expire\": 0}]" > $SPR_DIR/configs/auth/auth_tokens.json
else
	PASSWORD=$(cat "$SPR_DIR/configs/auth/auth_users.json" | jq -r .admin)
	TOKEN=$(cat "$SPR_DIR/configs/auth/auth_tokens.json" | jq -r '.[0].Token')
fi

# dns block. default: hosts,ads
# example, run with: DNS_BLOCK="hosts,malware,facebook,redirect"
if [ -z "$DNS_BLOCK" ]; then
	DNS_BLOCK="hosts,ads"
fi

if [ ! -z "$DNS_BLOCK" ] && [ -z $SKIP_DNS_BLOCK ]; then
        urls=()

        _IFS=$IFS
        IFS=','
        for f in $DNS_BLOCK; do
                if [ "$f" == "hosts" ]; then
                        urls+=("https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts")
                else
                        urls+=( "https://raw.githubusercontent.com/blocklistproject/Lists/master/${f}.txt" )
                fi
        done
        IFS=$_IFS

        CONF='{"BlockLists": [], "PermitDomains": [], "BlockDomains": [], "ClientIPExclusions": null}'
        for url in ${urls[@]}; do
                CONF=$(echo $CONF | jq ".BlockLists |= . + [{\"URI\": \"$url\", \"Enabled\": true, \"Tags\": []}]")
        done

        echo $CONF | jq . > $SPR_DIR/state/dns/block_rules.json
fi

echo "[+] login information:"
echo "=========================================================="

HOST=$EXTERNAL_IP
if [ $HOST == "127.0.0.1" ]; then
	HOST="sprvirtual"
fi

echo " http tunnel: ssh $HOST -N -L $EXTERNAL_PORT:127.0.0.1:$EXTERNAL_PORT"
echo "         url: http://localhost:$EXTERNAL_PORT/"
echo "    username: admin"
echo "    password: $PASSWORD"
if [ ! -z "$TOKEN" ]; then
	echo "       token: $TOKEN"
fi
echo "=========================================================="

# if set - exit
if [ ! -z $SKIP_VPN ]; then
	exit
fi

sleep 1
while grep "= privkey" $SPR_DIR/configs/wireguard/wg0.conf > /dev/null;
do
     echo "... Waiting for wireguard service to start and initialize"
     sleep 5
done

#only show confirm if its the first one
NUM_PEERS=$(grep '^\[Peer\]' $SPR_DIR/configs/wireguard/wg0.conf 2>/dev/null | wc -l)


echo "[+] num peers already configured: $NUM_PEERS"

# Use the API to generate a wireguard peer
RET=$(curl -s -H "Authorization: Bearer ${TOKEN}" -X PUT http://localhost:8000/plugins/wireguard/peer --data '{}')
PRIVATE_KEY=$(echo $RET | jq -r .Interface.PrivateKey)
PUBLIC_KEY=$(echo $PRIVATE_KEY | wg pubkey)
PUBLIC_KEY_ESCAPED=$(echo \"${PUBLIC_KEY}\" | jq -r @uri)
CLIENT_IP=$(echo $RET | jq -r .Interface.Address)
SERVER_PUBLIC_KEY=$(echo $RET | jq -r .Peer.PublicKey)
PRESHARED_KEY=$(echo $RET | jq -r .Peer.PresharedKey)
DNS_IP=$(echo $RET | jq -r .Interface.DNS)

# Update the Groups for the Device and Name
RET=$(curl -s -H "Authorization: Bearer ${TOKEN}" -X PUT http://localhost:8000/device?identity=${PUBLIC_KEY_ESCAPED} --data "{\"Groups\": [\"wan\", \"lan\", \"dns\"], \"Name\": \"peer${NUM_PEERS}\"}")

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

echo -e "\n[+] WireGuard config (save this as wg.conf & import in client):\n"
echo -e "$CONF\n"

>/dev/tty printf "Show QR Code? [Y/n] "
</dev/tty read -rn1
if [[ ! $REPLY =~ [nN](oO)* ]]; then
	echo -e "[+] WireGuard QR Code (import in iOS & Android app):\n"
	echo -e "$CONF" | qrencode -t ansiutf8
fi

# reload dns if we have modified blocks
if [ ! -z "$DNS_BLOCK" ]; then
	docker-compose -f docker-compose-virt.yml restart dns >/dev/null 2>&1 &
fi
