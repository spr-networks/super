#!/bin/bash
set -a
. /configs/base/config.sh

if [ "$ENABLE_TAILSCALE" != "true" ]; then
  exit
fi

TAILSCALE_STATE_DIR=/state/tailscale/tailscaled

tailscaled & >$TAILSCALE_STATE_DIR/stdout.log 2>$TAILSCALE_STATE_DIR/stderr.log

. /scripts/up.sh

/tailscale_plugin
