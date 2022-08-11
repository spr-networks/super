#!/bin/bash
### SPR auto-start command

set -a

. /spr-environment.sh

cd /home/spr/super/
docker-compose -f $COMPOSE_FILE up -d


ret=$?

if [ "$ret" -ne "0" ]; then
   # upon failure, run dhclient to get an IP
   dhclient $WANIF
fi

