#!/bin/bash
. /configs/base/config.sh

TAILSCALE_ARGS="--json --timeout ${TAILSCALE_TIMEOUT:-5s}"
if [ -n "$TAILSCALE_LOGIN_SERVER" ]; then
  TAILSCALE_ARGS="$TAILSCALE_ARGS --login-server $TAILSCALE_LOGIN_SERVER"
fi
if [ -n "$TAILSCALE_AUTH_KEY" ]; then
  TAILSCALE_ARGS="$TAILSCALE_ARGS --auth-key $TAILSCALE_AUTH_KEY"
fi

# Make a best effort attempt to reconnect if we've been pre-authorized.
# The user may still need to login and/or authorize via the web UI to finish connecting.
tailscale up $TAILSCALE_ARGS "$@"