#!/bin/bash
. /configs/base/config.sh

# Do not run in mesh mode for now
if [ -f state/plugins/mesh/enabled ]
  exit 0
fi

/code/multicastproxy
