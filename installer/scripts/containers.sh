#!/bin/bash

#pull containers and export them for setup to import
# note: running dockerd inside the chroot is more difficult than this

mkdir data/containers/
cd data
CONTAINERS=$(docker images "ghcr.io/spr-networks/*:latest" | awk '{print $1}' | grep -v REPOSITORY)
for x in $CONTAINERS
do
  docker save $x -o containers/$(basename $x).tar
done
