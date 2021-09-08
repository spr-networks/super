#!/bin/bash

#This script works around unfavorable constraints with
# docker build and docker-compose which makes it hard to actually
# compose multiple directories cleanly without bloating the build
# context with every project directory

export DOCKER_BUILDKIT=1 # or configure in daemon.json
export COMPOSE_DOCKER_CLI_BUILD=1

# Generate scripts based on the configuration
if [ '!' -d "configs/" ]; then
  echo Configs not initialized. See documentation. 
  echo Copy base/template_configs to ./configs and set up wifi passwords as well as config.sh
  exit 1
fi

if [ '!' -d "state/" ]; then
  mkdir state
fi

# Base
mkdir -p base/configs
cp configs/config.sh base/configs/
# DHCP
./configs/gen_coredhcp_yaml.sh > dhcp/configs/coredhcp.yml
mkdir -p dhcp/configs/zones/groups
cp configs/config.sh dhcp/configs/
cp -R configs/zones/ dhcp/configs/
# DNS
mkdir -p dns/configs
cp configs/dns-Corefile dns/configs/Corefile
# wifi
mkdir -p wifid/configs
./configs/gen_hostapd.sh > wifid/configs/hostapd.conf
cp configs/wpa2pskfile wifid/configs/wpa2pskfile
# muproxy
./configs/gen_multicast_startup.sh > multicast_udp_proxy/scripts/startup.sh
chmod +x multicast_udp_proxy/scripts/startup.sh
#flowgather
cp -n flowgather/code/flowgather.db state/flowgather.db
touch state/flowgather.json

BUILDARGS=""
if [ -f .github_creds ]; then
  BUILDARGS="--build-arg GITHUB_CREDS=`cat .github_creds`"
fi
docker-compose build ${BUILDARGS}
#docker-compose -f monitor-services-compose.yml build ${BUILDARGS}
