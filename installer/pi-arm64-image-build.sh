#!/bin/bash
set -e
cd ..
shopt -s expand_aliases
if ! which docker-compose > /dev/null 2>&1; then
    # Set an alias for docker-compose if it's missing
    alias docker-compose='docker compose'
fi

#DOCKER_DEFAULT_PLATFORM=linux/arm64 docker-compose pull
cd installer
cp ./data/spr.clean.img ./data/spr.img
./scripts/resize.sh
#./scripts/containers.sh
docker run --privileged -v /dev:/dev -v $PWD/data:/data -v $PWD/scripts:/scripts/ --platform=aarch64 ubuntu:23.10 /scripts/go-pi.sh
