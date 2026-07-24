#!/bin/sh
set -eu

exec /usr/local/bin/barely-ap \
  --config "${RUSTAP_CONFIG:-/configs/wifi/rustap.json}"
