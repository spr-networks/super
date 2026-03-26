#!/bin/bash
set -e
mkdir data
VERSION="2025-12-04"
IMG="${VERSION}-raspios-trixie-arm64-lite.img.xz"
HASH="681a775e20b53a9e4c7341d748a5a8cdc822039d8c67c1fd6ca35927abbe6290"

cd ./data

if [ ! -f $IMG ]; then
  if [ -f "/buildimages/${IMG}" ]; then
    cp "/buildimages/${IMG}" .
  else
    wget "https://downloads.raspberrypi.com/raspios_lite_arm64/images/raspios_lite_arm64-${VERSION}/${IMG}"
  fi
fi

if [ "$(sha256sum "$IMG" | cut -d' ' -f1)" != "$HASH" ]; then
  echo "SHA256 mismatch! Expected: $HASH"
  exit 1
fi

xzcat -T 0 $IMG > spr.clean.img
echo "[+] Extracted pi arm64 raspios trixie image"
