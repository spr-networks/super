#!/bin/bash

set -e

mkdir data
cd ./data

IMG=ubuntu-cn9130-cf-pro-mmc.1.1.img
TAG=spr-clearfog-noble
if [ ! -f $IMG ]; then
  wget -q "https://github.com/spr-networks/cn913x_build/releases/download/${TAG}/${IMG}"
fi

cp $IMG spr.clean.img
echo "[+] Extracted clearfog arm64 base image"
