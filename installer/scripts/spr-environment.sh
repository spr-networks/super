#!/bin/bash
# Modify these to change how the first setup will apply
WANIF=eth0 #modify with your device's outbound interface
COMPOSE_FILE=docker-compose-prebuilt.yml
ADMIN_USER=admin
ADMIN_PASSWORD=spradmin
#COMPOSE_FILE=docker-compose-src.yml # use this line instead to build SPR from source
