#!/bin/bash
### SPR auto-start command

set -a

. /spr-environment.sh

cd /home/spr/super/
./superd.sh
docker-compose -f $COMPOSE_FILE up -d
