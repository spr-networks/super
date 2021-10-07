#!/bin/bash

export DOCKER_BUILDKIT=1 # or configure in daemon.json
export COMPOSE_DOCKER_CLI_BUILD=1

# Generate scripts based on the configuration
if [ '!' -d "configs/" ]; then
  echo Configs not initialized. See documentation. 
  echo Copy base/template_configs to ./configs and set up wifi passwords as well as config.sh
  exit 1
fi

# gen configs
./configs/scripts/gen_coredhcp_yaml.sh > configs/dhcp/coredhcp.yml
./configs/scripts/gen_hostapd.sh > configs/wifi/hostapd.conf
./configs/scripts/gen_multicast_startup.sh > multicast_udp_proxy/scripts/startup.sh
./configs/scripts/gen_watchdog.sh  > configs/watchdog/watchdog.conf

# make sure state directories and files exist
mkdir -p state/dhcp/
mkdir -p state/dns/
mkdir -p state/wifi/
mkdir -p state/wifi/sta_mac_iface_map/
touch state/dns/local_mappings state/dhcp/leases.txt

BUILDARGS=""
if [ -f .github_creds ]; then
  BUILDARGS="--build-arg GITHUB_CREDS=`cat .github_creds`"
fi
docker-compose build ${BUILDARGS} $@
#docker-compose -f monitor-services-compose.yml build ${BUILDARGS}
