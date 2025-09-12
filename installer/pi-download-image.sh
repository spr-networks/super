#!/bin/bash
set -e
mkdir data
# 25.04 is not yet ready due to mt7915e, r8125 driver bugs
VERSION="24.04.3"
IMG="ubuntu-{$VERSION}-preinstalled-server-arm64+raspi.img.xz"

cd ./data

if [ ! -f $IMG ]; then
  #temp until 25.04 fixes drivers for r8125, mt7915
  wget -q "https://cdimage.ubuntu.com/releases/${VERSION}/release/${IMG}
fi

xzcat $IMG > spr.clean.img
echo "[+] Extracted pi arm64 ubuntu image"
