#!/bin/bash
set -e
mkdir data
VERSION="2026-09-15"
IMG="${VERSION}-raspios-trixie-arm64-lite.img.xz"
HASH="cdf4f3bfac35ae947b46e4e767f935453810549779ac3290e05a6754aee627e5"

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
