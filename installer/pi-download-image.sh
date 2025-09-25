#!/bin/bash
set -e
mkdir data
# 25.04 is not yet ready due to mt7915e, r8125 driver bugs
VERSION="24.04.3"
IMG="ubuntu-${VERSION}-preinstalled-server-arm64+raspi.img.xz"
HASH="9bb1799cee8965e6df0234c1c879dd35be1d87afe39b84951f278b6bd0433e56"

cd ./data

if [ ! -f $IMG ]; then
  if [ -f "/buildimages/${IMG}" ]; then
    cp "/buildimages/${IMG}" .
  else
    wget "https://cdimage.ubuntu.com/releases/${VERSION}/release/${IMG}"
  fi
fi

if [ "$(sha256sum "$IMG" | cut -d' ' -f1)" != "$HASH" ]; then
  echo "SHA256 mismatch! Expected: $HASH"
  exit 1
fi

xzcat $IMG > spr.clean.img
echo "[+] Extracted pi arm64 ubuntu image"
