#!/bin/bash
set -e
mkdir data
VERSION="26.04"
IMG="ubuntu-${VERSION}-preinstalled-server-arm64+raspi.img.xz"
HASH="10604098a0c4eeb7359e58e12b01badbce8c74b0d53b414e633ba0b047b512cd"

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

xzcat -T 0 $IMG > spr.clean.img
echo "[+] Extracted pi arm64 ubuntu image"
