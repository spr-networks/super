#!/bin/bash

#pull containers and export them for setup to import
# note: running dockerd inside the chroot is more difficult than this

mkdir data/containers/
cd data
CONTAINERS=$(docker images "ghcr.io/spr-networks/*:latest" | awk '{print $1}' | grep -v REPOSITORY)
for x in $CONTAINERS
do
  export CONTAINER=$(docker run --platform=aarch64 -d ${x} bash)
  docker export $CONTAINER > containers/$(basename $x).tar
  docker inspect -f '{{.Config.Entrypoint}}' $x | tr -d '[]' > containers/$(basename $x).tar.entry
done
