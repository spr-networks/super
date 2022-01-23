#!/bin/bash
if [ -z LOCALUI ]; then
  docker cp $(docker create --rm frontend):/app/build ./frontend/build
else
  docker cp $(docker create --rm ghcr.io/spr-networks/super_frontend):/build ./frontend/build
fi
