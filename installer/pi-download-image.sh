#!/bin/bash
set -e

mkdir data
VERSION="24.04"
IMG="ubuntu-${VERSION}-preinstalled-server-arm64+raspi.img.xz"

cd ./data

if [ ! -f $IMG ]; then
  wget -q "https://cdimage.ubuntu.com/releases/${VERSION}/release/${IMG}"
fi

xzcat $IMG > spr.clean.img
echo "[+] Extracted pi arm64 ubuntu image"
