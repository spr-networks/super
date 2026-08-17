#!/usr/bin/env bash
# update-pins.sh — re-resolve every pin, rewrite reproducible.env, and sync the
# matching `ARG <KEY>=` defaults and `# syntax=` lines across the Dockerfiles so
# the two never drift. All lookups are read-only (registry manifest inspect,
# go.dev, download.docker.com, git ls-remote, GitHub API). Review with `git diff`.
#
# To bump a version: edit a "tracked ref" below (or a git ref), then run this.
# The Ubuntu snapshot date is preserved unless you pass UBUNTU_SNAPSHOT=<ts>.
# Tip: `docker login` first to avoid Docker Hub's unauthenticated pull-rate-limit (429).
set -euo pipefail
cd "$(dirname "$0")"

# ---- tracked refs (edit to bump, then re-run) ----
UBUNTU_TAG=ubuntu:24.04
NODE_TAG=node:18
ALPINE_TAG=alpine:latest
DOCKERFILE_TAG=docker/dockerfile:1
BUILDKIT_TAG=moby/buildkit:buildx-stable-1
CONTAINER_TEMPLATE_TAG=ghcr.io/spr-networks/container_template:latest
GO_MINOR=1.26
OXWIFID_VERSION=0.1.8

say() { echo "  $*" >&2; }
mdigest() { docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}'; }
# resolve a git ref (HEAD / tag / refs/heads/<branch>) to a commit SHA,
# preferring the dereferenced commit for annotated tags
gitsha() {
  local out; out=$(git ls-remote "$1" "$2" "${2}^{}")
  awk '$2 ~ /\^\{\}$/{print $1; exit}' <<<"$out" | grep . \
    || awk 'NR==1{print $1}' <<<"$out"
}

echo "Resolving pins..." >&2
say "base images"
UBUNTU_REF="${UBUNTU_TAG}@$(mdigest "$UBUNTU_TAG")"
NODE_REF="${NODE_TAG}@$(mdigest "$NODE_TAG")"
ALPINE_REF="${ALPINE_TAG%%:*}@$(mdigest "$ALPINE_TAG")"
DOCKERFILE_SYNTAX="${DOCKERFILE_TAG}@$(mdigest "$DOCKERFILE_TAG")"
BUILDKIT_REF="${BUILDKIT_TAG}@$(mdigest "$BUILDKIT_TAG")"
CONTAINER_TEMPLATE_REF="${CONTAINER_TEMPLATE_TAG%:*}@$(mdigest "$CONTAINER_TEMPLATE_TAG")"

say "ubuntu snapshot"
UBUNTU_SNAPSHOT="${UBUNTU_SNAPSHOT:-$(grep -E '^UBUNTU_SNAPSHOT=' reproducible.env | cut -d= -f2)}"
code=$(curl -fsS -o /dev/null -w '%{http_code}' "https://snapshot.ubuntu.com/ubuntu/${UBUNTU_SNAPSHOT}/dists/noble/InRelease" || true)
[ "$code" = "200" ] || { echo "snapshot ${UBUNTU_SNAPSHOT} not valid (HTTP $code)" >&2; exit 1; }

say "docker-ce versions"
PKGS=$(curl -fsSL 'https://download.docker.com/linux/ubuntu/dists/noble/stable/binary-amd64/Packages')
dpkgver() { awk -v p="$1" '/^Package: /{c=$2} /^Version: /{if(c==p)print $2}' <<<"$PKGS" | sort -V | tail -1; }
DOCKER_CE_VERSION=$(dpkgver docker-ce)
DOCKER_CE_CLI_VERSION=$(dpkgver docker-ce-cli)
CONTAINERD_VERSION=$(dpkgver containerd.io)
DOCKER_BUILDX_PLUGIN_VERSION=$(dpkgver docker-buildx-plugin)
DOCKER_COMPOSE_PLUGIN_VERSION=$(dpkgver docker-compose-plugin)

say "go ${GO_MINOR}.x toolchain"
read -r GO_VERSION GO_SHA256_AMD64 GO_SHA256_ARM64 < <(
  curl -fsSL "https://go.dev/dl/?mode=json&include=all" | python3 -c '
import json,sys
gm=sys.argv[1]
vs=[v for v in json.load(sys.stdin) if v["version"].startswith("go"+gm+".")]
key=lambda v:[int(x) for x in (v["version"][2:].split(".")+["0","0"])[:3] if x.isdigit()]
v=sorted(vs,key=key)[-1]
sha={f["arch"]:f["sha256"] for f in v["files"] if f["os"]=="linux" and f["kind"]=="archive"}
print(v["version"][2:], sha["amd64"], sha["arm64"])' "$GO_MINOR")

say "oxwifid v${OXWIFID_VERSION} ARM64 release"
OXWIFID_ARM64_URL="https://github.com/spr-networks/oxwifid/releases/download/v${OXWIFID_VERSION}/barely-ap-v${OXWIFID_VERSION}-aarch64-unknown-linux-musl.tar.gz"
OXWIFID_ARCHIVE_FILE=$(mktemp)
trap 'rm -f "$OXWIFID_ARCHIVE_FILE"' EXIT
curl -fsSL -o "$OXWIFID_ARCHIVE_FILE" "$OXWIFID_ARM64_URL"
OXWIFID_ARM64_ARCHIVE_SHA256=$(sha256sum "$OXWIFID_ARCHIVE_FILE" | awk '{print $1}')
OXWIFID_ARCHIVE_ROOT="barely-ap-v${OXWIFID_VERSION}-aarch64-unknown-linux-musl"
OXWIFID_BARELY_AP_ARM64_SHA256=$(
  tar -xOzf "$OXWIFID_ARCHIVE_FILE" "${OXWIFID_ARCHIVE_ROOT}/barely-ap" |
    sha256sum | awk '{print $1}'
)
OXWIFID_BARELY_CLI_ARM64_SHA256=$(
  tar -xOzf "$OXWIFID_ARCHIVE_FILE" "${OXWIFID_ARCHIVE_ROOT}/barely-cli" |
    sha256sum | awk '{print $1}'
)

say "sprbus-json (from api/code/go.mod)"
SPRBUS_SHORT=$(awk '/spr-networks\/sprbus-json /{print $2}' api/code/go.mod | head -1); SPRBUS_SHORT=${SPRBUS_SHORT##*-}
SPRBUS_JSON_COMMIT=$(curl -fsSL "https://api.github.com/repos/spr-networks/sprbus-json/commits/${SPRBUS_SHORT}" | python3 -c 'import json,sys;print(json.load(sys.stdin)["sha"])')

say "git deps"
COREDHCP_COMMIT=$(gitsha https://github.com/spr-networks/coredhcp HEAD)
HOSTAP_COMMIT=$(gitsha https://github.com/spr-networks/hostap HEAD)
COREDNS_COMMIT=$(gitsha https://github.com/coredns/coredns v1.14.3)
XDP_TOOLS_COMMIT=$(gitsha https://github.com/xdp-project/xdp-tools v1.2.0)
GODNS_COMMIT=$(gitsha https://github.com/TimothyYe/godns v3.4.1)
COREDNS_JSONLOG_COMMIT=$(gitsha https://github.com/spr-networks/coredns-jsonlog refs/heads/sprbus-json)
COREDNS_BLOCK_COMMIT=$(gitsha https://github.com/spr-networks/coredns-block refs/heads/sprbus-json)
COREDNS_SPR_CACHE_COMMIT=$(gitsha https://github.com/spr-networks/coredns-spr_cache HEAD)
COREDNS_SPR_FORWARD_COMMIT=$(gitsha https://github.com/spr-networks/coredns-spr_forward HEAD)

echo "Writing reproducible.env" >&2
cat > reproducible.env <<EOF
# Pinned build inputs for build_docker_compose.sh and CI. Regenerate with ./update-pins.sh.

# Base images (multi-arch manifest digests) + Dockerfile frontend + BuildKit backend
UBUNTU_REF=${UBUNTU_REF}
NODE_REF=${NODE_REF}
ALPINE_REF=${ALPINE_REF}
DOCKERFILE_SYNTAX=${DOCKERFILE_SYNTAX}
BUILDKIT_REF=${BUILDKIT_REF}
CONTAINER_TEMPLATE_REF=${CONTAINER_TEMPLATE_REF}

# apt: Ubuntu snapshot timestamp (one host serves every arch + pocket)
UBUNTU_SNAPSHOT=${UBUNTU_SNAPSHOT}

# apt: Docker CE (download.docker.com, exact versions; not covered by the ubuntu snapshot)
DOCKER_CE_VERSION=${DOCKER_CE_VERSION}
DOCKER_CE_CLI_VERSION=${DOCKER_CE_CLI_VERSION}
CONTAINERD_VERSION=${CONTAINERD_VERSION}
DOCKER_BUILDX_PLUGIN_VERSION=${DOCKER_BUILDX_PLUGIN_VERSION}
DOCKER_COMPOSE_PLUGIN_VERSION=${DOCKER_COMPOSE_PLUGIN_VERSION}

# Go toolchain (download + verify; GOTOOLCHAIN=local). Must be >= go.mod (api: 1.26.0)
GO_VERSION=${GO_VERSION}
GO_SHA256_AMD64=${GO_SHA256_AMD64}
GO_SHA256_ARM64=${GO_SHA256_ARM64}

# oxwifid Rust AP/uplink release (currently published for Linux ARM64 only)
OXWIFID_VERSION=${OXWIFID_VERSION}
OXWIFID_ARM64_URL=${OXWIFID_ARM64_URL}
OXWIFID_ARM64_ARCHIVE_SHA256=${OXWIFID_ARM64_ARCHIVE_SHA256}
OXWIFID_BARELY_AP_ARM64_SHA256=${OXWIFID_BARELY_AP_ARM64_SHA256}
OXWIFID_BARELY_CLI_ARM64_SHA256=${OXWIFID_BARELY_CLI_ARM64_SHA256}

# git-cloned source deps pinned to commit SHAs
COREDHCP_COMMIT=${COREDHCP_COMMIT}
HOSTAP_COMMIT=${HOSTAP_COMMIT}
COREDNS_COMMIT=${COREDNS_COMMIT}
XDP_TOOLS_COMMIT=${XDP_TOOLS_COMMIT}
GODNS_COMMIT=${GODNS_COMMIT}
SPRBUS_JSON_COMMIT=${SPRBUS_JSON_COMMIT}
COREDNS_JSONLOG_COMMIT=${COREDNS_JSONLOG_COMMIT}
COREDNS_BLOCK_COMMIT=${COREDNS_BLOCK_COMMIT}
COREDNS_SPR_CACHE_COMMIT=${COREDNS_SPR_CACHE_COMMIT}
COREDNS_SPR_FORWARD_COMMIT=${COREDNS_SPR_FORWARD_COMMIT}
EOF

echo "Syncing Dockerfile ARG defaults + # syntax= lines" >&2
DOCKERFILES=()
while IFS= read -r f; do DOCKERFILES+=("$f"); done < <(find . -path ./node_modules -prune -o -type f -name Dockerfile -print)
replace_line() {  # replace_line <file> <sed-pattern> <new-line>
  local f="$1" pat="$2" new="$3" tmp
  tmp=$(mktemp)
  sed "s|${pat}|${new}|" "$f" > "$tmp" && mv "$tmp" "$f"
}
while IFS='=' read -r k v; do
  case "$k" in ''|\#*) continue;; esac
  for f in "${DOCKERFILES[@]}"; do
    if [ "$k" = "DOCKERFILE_SYNTAX" ]; then
      replace_line "$f" '^# syntax=.*' "# syntax=${v}"
    else
      # cover both `ARG KEY=old` and a bare `ARG KEY` — a bare ARG leaves
      # FROM ${KEY} blank when built outside build_docker_compose.sh
      replace_line "$f" "^ARG ${k}=.*" "ARG ${k}=${v}"
      replace_line "$f" "^ARG ${k}\$" "ARG ${k}=${v}"
    fi
  done
done < reproducible.env

echo "Done. Review: git diff reproducible.env && git diff -- '*Dockerfile'" >&2
