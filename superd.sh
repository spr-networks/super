#!/bin/bash
set -a
. /spr-environment.sh
if [ ! -f "./superd/superd" ]; then
  cd superd
  DOCKER_BUILDKIT=1 docker build . -t superd
  docker cp $(docker create --rm superd):/superd ./superd
  cd ..
fi

./superd/superd &
