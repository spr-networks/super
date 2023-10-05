#!/bin/bash
set -a
. /configs/base/config.sh

# Do not run in mesh mode for now
if [ -f state/plugins/mesh/enabled ]; then
  exit 0
fi

/code/multicastproxy
