#!/bin/bash
set -e

cd "$(dirname "$0")"

# Refresh the base and package layers so security updates are not cached away.
docker build --pull --no-cache -t spr-pi-builder -f Dockerfile.pi-builder .

if [ ! -f data/spr.clean.img ]; then
  ./pi-download-image.sh
fi

# Mount at the same absolute path so nested docker volume mounts resolve
# correctly against the Docker Desktop file sharing (which uses macOS paths)
docker run --rm \
  --privileged \
  -v /dev:/dev \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$(pwd)":"$(pwd)" \
  -w "$(pwd)" \
  spr-pi-builder \
  ./pi-arm64-image-build.sh
