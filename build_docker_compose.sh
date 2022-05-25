#!/bin/bash

export DOCKER_BUILDKIT=1 # or configure in daemon.json
export COMPOSE_DOCKER_CLI_BUILD=1

if [ '!' -d "configs/" ]; then
  echo Configs not initialized
  echo Copy base/template_configs to ./configs and set up base/config/config.sh and base/config/auth_users.json
  echo See the guide for help: https://www.supernetworks.org/pages/docs/setup_run_spr
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

for DC in docker-compose.yml docker-compose-src.yml; do
  docker buildx bake -f ${DC} \
    --set "*.cache-from=type=local,src=/tmp/.buildx-cache" \
    --set "*.cache-to=type=local,dest=/tmp/.buildx-cache-new,mode=max" \
    --set "*.platform=linux/amd64,linux/arm64" \
    ${BUILDARGS} $@
done
