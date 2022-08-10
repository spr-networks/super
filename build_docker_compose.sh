#!/bin/bash -eu

export DOCKER_BUILDKIT=1 # or configure in daemon.json
export COMPOSE_DOCKER_CLI_BUILD=1

if [ '!' -d "configs/" ]; then
  echo Configs not initialized
  echo Copy base/template_configs to ./configs and set up base/config/config.sh and base/config/auth_users.json
  echo See the guide for help: https://www.supernetworks.org/pages/docs/setup_run_spr
  exit 1
fi

# remove prebuilt images
FOUND_PREBUILT_IMAGE=false
for SERVICE in $(docker-compose config --service); do
  # keep the prebuilt frontend image
  if [ "$SERVICE" = "frontend" ]; then
    continue
  fi

  IS_PREBUILT=$(docker inspect \
    --format '{{ index .Config.Labels "org.supernetworks.ci" }}' \
    "ghcr.io/spr-networks/super_${SERVICE}" \
    2>/dev/null || echo "false" \
  )
  if [ "$IS_PREBUILT" = "true" ]; then
    IMAGE="ghcr.io/spr-networks/super_${SERVICE}"
    echo "Removing prebuilt image ${IMAGE}"
    docker image rm -f "$IMAGE"
    FOUND_PREBUILT_IMAGE=true
  fi
done

if [ "$FOUND_PREBUILT_IMAGE" = "true" ]; then
    echo "Pruning dangling container images"
    docker image prune -f
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

#pull the prebuilt frontend
docker pull ghcr.io/spr-networks/super_frontend:latest

BUILDARGS=""
if [ -f .github_creds ]; then
  BUILDARGS="--build-arg GITHUB_CREDS=`cat .github_creds`"
fi
docker-compose build ${BUILDARGS} $@

ret=$?

if [ "$ret" -ne "0" ]; then
  echo "Tip: if the build failed to resovle domain names," 
  echo "consider running ./base/docker_nftables_setup.sh"
  echo "since iptables has been disabled for docker in the"
  echo "SPR installer"
fi
