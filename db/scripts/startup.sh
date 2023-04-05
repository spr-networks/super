#!/bin/bash
set -a
. /configs/base/config.sh

STATE_DIR="/state/plugins/db"

if [ ! -d "$STATE_DIR" ]; then
    mkdir "$STATE_DIR"
fi

/boltapi
