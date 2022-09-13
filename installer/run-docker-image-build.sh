#!/bin/bash
cd ..
DOCKER_DEFAULT_PLATFORM=linux/arm64 docker-compose pull
cd installer
cp ./data/spr.clean.img ./data/spr.img
./scripts/resize.sh
./scripts/containers.sh
docker run --privileged -v /dev:/dev -v $PWD/data:/data -v $PWD/scripts:/scripts/ --platform=aarch64 ubuntu /scripts/go.sh
