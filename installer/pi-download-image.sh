#!/bin/bash
set -e

mkdir data
# 25.04 is not yet ready due to mt7915e, r8125 driver bugs
# 24.10 is needed for cm5 support
VERSION="24.10"
IMG="ubuntu-${VERSION}-preinstalled-server-arm64+raspi.img.xz"

cd ./data

if [ ! -f $IMG ]; then
  wget -q "https://cdimage.ubuntu.com/releases/${VERSION}/release/${IMG}"
fi

xzcat $IMG > spr.clean.img
echo "[+] Extracted pi arm64 ubuntu image"
