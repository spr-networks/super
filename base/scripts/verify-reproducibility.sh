#!/bin/bash
# Verify local SPR container builds match the published images on GHCR.
#
# Usage:
#   verify-reproducibility.sh prep              # chmod g+w on tracked files
#                                               # (matches CI runner umask=002)
#   verify-reproducibility.sh [tag]             # default tag = git tag on HEAD
#   verify-reproducibility.sh diff <container>  # show what differs in one container
#
#   cd ~/super
#   ./scripts/verify-reproducibility.sh prep
#   docker buildx prune -af --builder super-builder
#   ./build_docker_compose.sh --load     # RELEASE_VERSION auto-derived from git
#   ./scripts/verify-reproducibility.sh  # tag also auto-derived from git
set -u

ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
# Local images are normally tagged :latest (build script default). The
# remote tag matches the version on HEAD — derived from git so you don't
# have to pass anything. Pass an explicit tag as the first arg to override
# the remote side.
LOCAL_TAG="${LOCAL_TAG:-latest}"
REMOTE_TAG=$(git describe --tags --abbrev=0 2>/dev/null | grep -Eo '[0-9]+\.[0-9]+\.[0-9]+' || echo "latest")

CONTAINERS=(
  super_base super_api super_dns super_dhcp super_dhcp_client
  super_wifid super_wireguard super_watchdog super_superd
  super_frontend super_multicast_udp_proxy super_plugin-lookup
  super_db super_wifiuplink super_packet_logs super_ppp super_dyndns
)

# CI runs with umask 002; a normal local checkout has umask 022. That single
# bit drift produces 644 vs 664 (and 755 vs 775) on every COPY'd file, which
# changes the layer hash. Strip the variance by adding group-write to match
# CI before the build.
prep_workspace() {
  if [ ! -d .git ]; then
    echo "not in a git repo, refusing to chmod" >&2
    exit 1
  fi
  # Tracked files: directly.
  git ls-files -z | xargs -0 chmod g+w
  # Tracked-file parent directories (recursively up the tree). git ls-files
  # doesn't list dirs, so without this the build copies dirs at host umask
  # (755) into the build stage, and yarn / cp inherit that mode for output
  # subdirectories — observed for /app/build/fonts/.
  git ls-files | xargs -n1 dirname | sort -u | grep -v '^\.$' | xargs chmod g+w
  echo "applied chmod g+w to tracked files and their parent directories"
}

# Walk: tag -> per-arch manifest -> config digest. Returns the per-arch
# config digest, which is what the local image's .Id should equal when the
# build is byte-reproducible.
remote_config_digest() {
  local ref="$1"
  local arch_digest
  arch_digest=$(docker manifest inspect "$ref" 2>/dev/null \
    | jq -r --arg a "$ARCH" '.manifests[]|select(.platform.architecture==$a and .platform.os=="linux")|.digest')
  [ -z "$arch_digest" ] || [ "$arch_digest" = "null" ] && return 1
  docker manifest inspect "${ref%:*}@${arch_digest}" 2>/dev/null | jq -r '.config.digest'
}

# Drill into one container: show layer diffIDs side by side, then the
# config blob fields that differ if all layers match.
diff_container() {
  local c="$1"
  local local_ref="ghcr.io/spr-networks/${c}:${LOCAL_TAG}"
  local remote_ref="ghcr.io/spr-networks/${c}:${REMOTE_TAG}"
  local local_id remote_cfg arch_digest
  local_id=$(docker image inspect "$local_ref" -f '{{.Id}}' 2>/dev/null) || { echo "not built locally"; exit 1; }
  arch_digest=$(docker manifest inspect "$remote_ref" | jq -r --arg a "$ARCH" '.manifests[]|select(.platform.architecture==$a and .platform.os=="linux")|.digest')
  remote_cfg=$(docker manifest inspect "${remote_ref%:*}@${arch_digest}" | jq -r '.config.digest')

  echo "container: $c   local=:${LOCAL_TAG}   remote=:${REMOTE_TAG}"
  echo "local  config: $local_id"
  echo "remote config: $remote_cfg"
  echo
  echo "== layer diffIDs (remote -> local) =="
  diff \
    <(docker buildx imagetools inspect "${remote_ref%:*}@${remote_cfg}" --raw | jq -r '.rootfs.diff_ids[]' | nl) \
    <(docker inspect "$local_ref" --format='{{join .RootFS.Layers "\n"}}' | nl) \
    && echo "  all layers match"
  echo
  echo "== config diff (remote -> local), excluding history & created =="
  diff \
    <(docker buildx imagetools inspect "${remote_ref%:*}@${remote_cfg}" --raw \
       | jq '{env: .config.Env, entrypoint: .config.Entrypoint, labels: .config.Labels, workingdir: .config.WorkingDir, user: .config.User, cmd: .config.Cmd}' --sort-keys) \
    <(docker image inspect "$local_ref" \
       | jq '.[0] | {env: .Config.Env, entrypoint: .Config.Entrypoint, labels: .Config.Labels, workingdir: .Config.WorkingDir, user: .Config.User, cmd: .Config.Cmd}' --sort-keys) \
    && echo "  no meaningful config differences"
}

# Does the layer set (rootfs.diff_ids) on both sides match? If so, the
# build is byte-reproducible at the layer level — any remaining config
# digest mismatch is metadata (the version label, mostly).
layers_match() {
  local local_ref="$1" remote_cfg="$2"
  local rem
  rem=$(docker buildx imagetools inspect "${local_ref%:*}@${remote_cfg}" --raw 2>/dev/null \
        | jq -r '.rootfs.diff_ids[]')
  local loc
  loc=$(docker inspect "$local_ref" --format='{{join .RootFS.Layers "\n"}}' 2>/dev/null)
  [ -n "$rem" ] && [ "$rem" = "$loc" ]
}

run_verify() {
  local fails=0
  for c in "${CONTAINERS[@]}"; do
    local local_ref="ghcr.io/spr-networks/${c}:${LOCAL_TAG}"
    local remote_ref="ghcr.io/spr-networks/${c}:${REMOTE_TAG}"
    local local_id remote_cfg
    local_id=$(docker image inspect "$local_ref" -f '{{.Id}}' 2>/dev/null) || { printf "SKIP   %s (not built locally)\n" "$c"; continue; }
    remote_cfg=$(remote_config_digest "$remote_ref") || { printf "SKIP   %s (no published manifest for $ARCH)\n" "$c"; continue; }
    if [ "$local_id" = "$remote_cfg" ]; then
      printf "OK     %s\n" "$c"
    elif layers_match "$local_ref" "$remote_cfg"; then
      printf "OK*    %s  (layers identical; config differs — likely just the version label)\n" "$c"
    else
      printf "DIFFER %s\n  local:  %s\n  remote: %s\n" "$c" "$local_id" "$remote_cfg"
      fails=$((fails + 1))
    fi
  done
  echo
  echo "compared local :${LOCAL_TAG} against remote :${REMOTE_TAG}"
  if [ "$fails" -eq 0 ]; then
    echo "all containers reproduce"
  else
    echo "${fails} container(s) differ at the layer level; run: $0 diff <container>"
    exit 1
  fi
}

case "${1:-}" in
  prep)
    prep_workspace
    ;;
  diff)
    [ $# -lt 2 ] && { echo "usage: $0 diff <container> [remote-tag]"; exit 2; }
    [ -n "${3:-}" ] && REMOTE_TAG="$3"
    diff_container "$2"
    ;;
  "")
    run_verify
    ;;
  *)
    REMOTE_TAG="$1"
    run_verify
    ;;
esac
