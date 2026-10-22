#!/bin/bash
set -e
mkdir data
VERSION="2026-10-06"
IMG="${VERSION}-raspios-trixie-arm64-lite.img.xz"
HASH="483db18a48da399b5b7022ffae9a07bc6d99daab30e593aedac09b69ff422843"

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
