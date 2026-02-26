#!/bin/bash
set -e
mkdir data
# 26.04 lands april 23rd , 2026 -- tested working
VERSION="24.04.4"
IMG="ubuntu-${VERSION}-preinstalled-server-arm64+raspi.img.xz"
HASH="790652faeb4f61ce7bb12f5cb61734595c61d3cd882915b8b5f9918106c80d37"

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
