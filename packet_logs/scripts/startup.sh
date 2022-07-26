#!/bin/bash
set -a
. /configs/base/config.sh

F="/state/plugins/packet_logs/ulogd.json"

rm -f "$F"
mknod "$F" p

/packet_logs
