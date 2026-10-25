#!/usr/bin/env bash
# Build SPR's rpi-image-gen image for the Pi 5 / CM5: Raspberry Pi OS
# (trixie minbase) with rpi-image-gen's A/B layout and SPR's services as
# systemd units (layer/spr.yaml), no Docker. Runs anywhere Docker runs arm64
# containers natively (an Apple Silicon Mac, an arm64 Linux host).
#
#   ./installer/rpi-image-gen/build-image.sh [extra rpi-image-gen config vars]
#   e.g. ... IGconf_device_layer=spr-cm5
#
# Output in installer/rpi-image-gen/output: the disk image (.img.zst), the
# A/B update bundle superd/rpios installs (.update.tar.zst) and the SBOM.
# SPR_IMAGE_TAG picks the super_* images (default: the latest release).
# The work tree is the docker volume SPR_WORK_VOLUME (spr-rig-work).
set -euo pipefail
cd "$(dirname "$0")/../.."

BUILDER=spr-rpi-image-gen
VOL=${SPR_WORK_VOLUME:-spr-rig-work}
OUT=installer/rpi-image-gen/output
H=/home/build

if [ "${1:-}" = --inside ]; then
  shift
  sudo chown build: $H/work
  # the parts of the repo the image is built from, owned by the build user
  # (root in rpi-image-gen's user namespace: overlays are copied with their
  # owner), without untracked or ignored files
  SRC=$H/work/src
  rm -rf $SRC
  mkdir -p $SRC
  git config --global --add safe.directory $PWD
  git ls-files -co --exclude-standard -- installer/rpi-image-gen installer/raspbian/firmware \
      installer/raspbian/scripts/fetch-spr-kernel.sh reproducible.env base dhcp/scripts \
      dns/scripts api/scripts wifid/scripts wireguard/scripts db/scripts packet_logs/scripts \
      multicast_udp_proxy/scripts plugin-lookup/scripts plugin-lookup/data wifi_uplink/scripts \
      ppp/scripts |
    tar -cf - --no-recursion -T - | tar -xf - -C $SRC --no-same-owner
  cd $SRC
  sudo rm -rf $H/work/assets
  ./installer/rpi-image-gen/fetch-assets.sh $H/work/assets
  install -m 755 $H/work/superd $H/work/assets/superd
  sudo rm -rf $H/work/build
  mkdir -p $H/work/build
  /opt/rpi-image-gen/rpi-image-gen build -B $H/work/build \
    -S ./installer/rpi-image-gen -c spr.yaml -- \
    IGconf_spr_assets=$H/work/assets IGconf_spr_src=$SRC \
    IGconf_artefact_version="$(cat $H/work/assets/images/tag)" "$@"
  rm -rf $H/work/out
  mkdir -p $H/work/out
  deploy=$(ls -d $H/work/build/deploy-* | tail -1)
  cp "$deploy"/*.img.zst "$deploy"/*.update.tar.zst "$deploy"/*.sbom.zst "$deploy"/manifest.zst $H/work/out/
  exit 0
fi

. ./reproducible.env
docker build -q -t $BUILDER installer/rpi-image-gen >/dev/null
docker volume create $VOL >/dev/null

# superd/rpios, as the NixOS image builds superd/nixos: static, stripped
docker run --rm -v "$PWD/superd/rpios":/src:ro -v $VOL:/work -v spr-go-cache:/go \
  -w /src -e CGO_ENABLED=0 -e GOOS=linux -e GOARCH=arm64 golang:$GO_VERSION \
  go build -trimpath -ldflags "-s -w" -o /work/superd .

docker run --rm --privileged -v $VOL:$H/work -v "$PWD":$H/super:ro -w $H/super \
  -e SPR_IMAGE_TAG="${SPR_IMAGE_TAG:-}" $BUILDER \
  ./installer/rpi-image-gen/build-image.sh --inside "$@"

mkdir -p $OUT
rm -f $OUT/*.img.zst $OUT/*.update.tar.zst $OUT/*.sbom.zst $OUT/manifest.zst
docker run --rm -v $VOL:/w -v "$PWD/$OUT":/o alpine sh -c "cp /w/out/* /o/ && chown $(id -u):$(id -g) /o/*"
ls -lh $OUT
