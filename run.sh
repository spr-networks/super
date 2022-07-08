#!/bin/bash

# default is to run prebuilt, pull containers if not available
# example to run src:
# SPRENV=src ./run.sh

# NOTE this should be the same run.sh as installer/scripts/run-scripts/run.sh

SPRENV="${SPRENV:=prebuilt}"
COMPOSE_FILE="docker-compose-$SPRENV.yml" 

# check if we have pulled spr containers
docker images | grep super_api >/dev/null
if [ "$SPRENV" == "prebuilt" ] && [ $? -ne 0 ] ; then 
	./pull_containers.sh
fi

# make sure we have default config
if [ ! -f "configs/base/config.sh" ]; then
	cp base/template_configs/base/config.sh configs/base
fi

# check if this is the first run
# if so loop and wait for .spr-restart when setup is done
if [ ! -f "./.spr-setup-done" ]; then
	echo "+ spr setup mode. waiting for config to restart..."
	while true; do
		if [ -f "./state/api/.spr-restart" ]; then
			rm -f "./state/api/.spr-restart"
			touch "./.spr-setup-done"
			docker-compose -f "$COMPOSE_FILE" restart
			break
		fi
		sleep 5
	done &
fi

docker-compose -f "$COMPOSE_FILE" up -d
