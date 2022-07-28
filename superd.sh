#!/bin/bash
set -a
. /spr-environment.sh
cd superd

DOCKER_BUILDKIT=1 docker build . -t superd
docker cp $(docker create --rm superd):/superd ./superd
cd ..

if [ ! -f "./superd/superd" ]; then
  echo "[-] Failed to build superd"
  exit 1
fi

./superd/superd &
