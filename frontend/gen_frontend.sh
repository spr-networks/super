#!/bin/bash
rm -rf ./frontend/build
docker cp \
  $(docker create --rm ghcr.io/spr-networks/super_frontend dummy):/app/build \
  ./frontend/build
