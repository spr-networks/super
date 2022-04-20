#!/bin/bash
set -a
. /configs/base/config.sh
MACHINE_ID=$(ls -1 /var/log/journal|head -1)
echo $MACHINE_ID > /etc/machine-id
/api
