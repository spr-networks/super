#!/bin/bash

if [ '!' -d "configs/" ]; then
  echo Configs not initialized
  echo Copy base/template_configs to ./configs and set up base/config/config.sh and base/config/auth_users.json
  echo See the guide for help: https://www.supernetworks.org/pages/docs/setup_run_spr
  exit 1
fi

shopt -s expand_aliases
if ! which docker-compose > /dev/null 2>&1; then
    # Set an alias for docker-compose if it's missing
    alias docker-compose='docker compose'
fi

# Reproducible build: thread the pinned inputs into the build and set
# SOURCE_DATE_EPOCH from the commit. See REPRODUCIBLE.md.
REPRO_ENV="$(dirname "$0")/reproducible.env"
BAKE_SET=()
if [ -f "$REPRO_ENV" ]; then
  while IFS='=' read -r k v; do
    case "$k" in ''|\#*) continue;; esac
    BAKE_SET+=(--set "*.args.${k}=${v}")
  done < <(grep -vE '^[[:space:]]*(#|$)' "$REPRO_ENV")
fi
# Use epoch 0 so BuildKit's rewrite-timestamp clamp normalizes every file's
# mtime to a single value, regardless of host filesystem state.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-0}"
BAKE_SET+=(--set "*.args.SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}")
echo "SOURCE_DATE_EPOCH=${SOURCE_DATE_EPOCH}"
# shellcheck disable=SC1090
[ -f "$REPRO_ENV" ] && . "$REPRO_ENV"

# Strip group/world write so COPY layer modes don't depend on the umask of
# whoever ran git checkout.
[ -d .git ] && find . \( -path ./.git -o -name node_modules \) -prune -o ! -type l -exec chmod go-w {} +

# remove prebuilt images
FOUND_PREBUILT_IMAGE=false
for SERVICE in $(docker-compose config --services); do

  if [[ -z "$DO_CLEAN" ]]
  then
    break
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

# set version
# NOTE if we rebuild a single container could still be old version
#git tag -l --sort=-creatordate  | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1 > ./version.txt

# make sure state directories and files exist
mkdir -p state/api/
mkdir -p state/superd/
mkdir -p state/dhcp/
mkdir -p state/dns/
mkdir -p state/wifi/
touch state/dns/local_mappings state/dhcp/leases.txt

PLUGINS="${PLUGINS-dyndns ppp wifi_uplink}"
if [ -f .github_creds ]; then
  BAKE_SET+=(--set "*.args.GITHUB_CREDS=$(cat .github_creds)")
fi

docker --help | grep buildx
missing_buildx=$?

if [ "$missing_buildx" -eq "1" ];
then
  # Fallback (no buildx): NOT bit-for-bit (docker exporter can't rewrite timestamps).
  export DOCKER_BUILDKIT=1
  export COMPOSE_DOCKER_CLI_BUILD=1
  if [ -z "$SKIP_MAIN" ]; then
    docker-compose build "$@" || exit 1
  fi

  for plugin in $PLUGINS
  do
    docker-compose --file ${plugin}/docker-compose.yml build "$@" || exit 1
  done
else
  # Recreate super-builder if its BuildKit image doesn't match BUILDKIT_REF.
  if docker buildx inspect super-builder >/dev/null 2>&1; then
    CURRENT_BUILDKIT=$(docker buildx inspect super-builder \
      | sed -n 's/.*image="\([^"]*\)".*/\1/p' | head -1)
    if [ -n "${BUILDKIT_REF}" ] && [ "$CURRENT_BUILDKIT" != "${BUILDKIT_REF}" ]; then
      echo "super-builder has wrong BuildKit image, recreating"
      docker buildx rm super-builder
    fi
  fi
  docker buildx create --name super-builder --driver docker-container \
    --driver-opt "image=${BUILDKIT_REF}" \
    2>/dev/null || true

  # Always export with rewrite-timestamp; map --load/--push onto the exporter.
  OUTPUT="type=docker,rewrite-timestamp=true"
  ARGS=()
  for a in "$@"; do
    case "$a" in
      --load) ;;
      --push) OUTPUT="type=registry,rewrite-timestamp=true" ;;
      *) ARGS+=("$a") ;;
    esac
  done

  if [ -z "$SKIP_MAIN" ]; then
    docker buildx bake \
      --builder super-builder \
      --file docker-compose.yml \
      "${BAKE_SET[@]}" --set "*.output=${OUTPUT}" "${ARGS[@]}" || exit 1
  fi

  for plugin in $PLUGINS
  do
    pushd ${plugin}
    docker buildx bake \
      --builder super-builder \
      --file docker-compose.yml \
      "${BAKE_SET[@]}" --set "*.output=${OUTPUT}" "${ARGS[@]}" || exit 1
    popd
  done
fi

ret=$?

if [ "$ret" -ne "0" ]; then
  echo "Tip: if the build failed to resolve domain names,"
  echo "consider running ./base/docker_nftables_setup.sh"
  echo "since iptables has been disabled for docker in the"
  echo "SPR installer"
fi
