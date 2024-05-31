#!/bin/bash
set -e
cd ..
shopt -s expand_aliases
if ! which docker-compose > /dev/null 2>&1; then
    # Set an alias for docker-compose if it's missing
    alias docker-compose='docker compose'
fi

cd installer
cp ./data/spr.clean.img ./data/spr.img
./scripts/resize.sh
# pull default containers and default plugins
DOCKER_DEFAULT_PLATFORM=linux/arm64 docker-compose pull -f docker-compose.yml  -f dyndns/docker-compose.yml -f ppp/docker-compose.yml -f wifi_uplink/docker-compose.yml pull
./scripts/containers.sh
#use host for next ubuntu
DOCKER_DEFAULT_PLATFORM="" docker-compose pull ubuntu:24.04
docker run --privileged -v /dev:/dev -v $PWD/data:/data -v $PWD/scripts:/scripts/ ubuntu:24.04 /scripts/go-pi.sh
docker run --privileged -v /dev:/dev -v $PWD/data:/data -v $PWD/scripts:/scripts/ --platform=aarch64 ubuntu:24.04 /scripts/go-pi-target.sh
./scripts/shrink.sh
