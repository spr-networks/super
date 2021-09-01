#!/bin/bash
cp ../base/scripts/config.sh scripts/config.sh
export DOCKER_BUILDKIT=1
docker build . -t flowgather

