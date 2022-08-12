#!/bin/bash

set -e

mkdir data
VERSION="22.04.1"
IMG="ubuntu-${VERSION}-preinstalled-server-arm64+raspi.img.xz"

cd ./data

if [ ! -f $IMG ]; then
  wget -q "https://cdimage.ubuntu.com/releases/${VERSION}/release/${IMG}"
fi

xzcat $IMG > spr.clean.img
echo "[+] Extracted spr"
