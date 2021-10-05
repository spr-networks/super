#!/bin/bash
NAME=$1
MAC=$2
ZONE=$3
WPA_TYPE=$4
GENKEY=$5

if [ -z $NAME ] || [ -z $MAC ] || [ -z $ZONE ] || [ -z $WPA_TYPE ]; then
  echo Usage: $0 name mac_addr zone wpa3/2 [genkey]
  exit 1
fi

if [ "$WPA_TYPE" != "wpa3" ] && [ "$WPA_TYPE" != "wpa2" ]; then
  echo wpa2 or wpa3 required
  exit 1
fi


if [[ "$ZONE" =~ ^(isolated|lan_only|wan_lan|wan_lan_admin|wan_only)$ ]]; then
    :
else
    echo "Invalid zone for device. use one of: isolated lan_only wan_lan wan_lan_admin wan_only"
    exit 1
fi

if [ -z $GENKEY ] || [ "$GENKEY" != genkey ]; then
  echo Enter wifi station password for $MAC
  echo -n Password:
  read -s password
else
  password=$(tr -dc A-Za-z0-9 </dev/urandom | head -c 20)
  echo Generated password for $MAC : $password
fi

echo $WPA_TYPE $password $MAC $ZONE

echo -e "#Name: $NAME\n$MAC" >> configs/zones/$ZONE

if [ "$WPA_TYPE" = "wpa3" ]; then
  echo "sae_password=$password|mac=$MAC" >> configs/wifi/sae_passwords
elif [ "$WPA_TYPE" = "wpa2" ]; then
  echo "$MAC $password" >> configs/wifi/wpa2pskfile
fi

#export DOCKER_BUILDKIT=1 # or configure in daemon.json
#export COMPOSE_DOCKER_CLI_BUILD=1
#docker-compose build wifid

