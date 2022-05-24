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
if [ ! -f configs/dhcp/coredhcp.yml ]; then
  ./configs/scripts/gen_coredhcp_yaml.sh > configs/dhcp/coredhcp.yml
  ./configs/scripts/gen_hostapd.sh > configs/wifi/hostapd.conf
  ./configs/scripts/gen_watchdog.sh  > configs/watchdog/watchdog.conf
fi

# make sure state directories and files exist
mkdir -p state/api/
mkdir -p state/dhcp/
mkdir -p state/dns/
mkdir -p state/wifi/
mkdir -p state/wifi/sta_mac_iface_map/
touch state/dns/local_mappings state/dhcp/leases.txt

# pull the prebuilt frontend
docker pull ghcr.io/spr-networks/super_frontend:latest

BUILDARGS=""
if [ -f .github_creds ]; then
  BUILDARGS="--set target.args.GITHUB_CREDS=`cat .github_creds`"
fi

# create a new buildx builder so we can cross-compile
docker buildx create --use

docker buildx bake \
  --set "*.cache-from=type=local,src=/tmp/.buildx-cache" \
  --set "*.cache-to=type=local,dest=/tmp/.buildx-cache-new,mode=max" \
  --set "*.platform=linux/amd64,linux/arm64" \
  ${BUILDARGS} $@
