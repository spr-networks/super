#!/bin/bash
### SPR auto-start command

set -a

. /spr-environment.sh

# Work-around for USB bug with Ubuntu & TP-Link adapters
if grep --quiet Raspberry /proc/cpuinfo; then
  # Reset the bus for TP-Link adapter
  BUS=$(lsusb | grep TP-Link | grep LAN | awk '{print $2}' | sed 's/^0*//')
  if [ -n "$BUS" ]; then
    echo 0 > /sys/bus/usb/devices/${BUS}-1/authorized
    echo 1 > /sys/bus/usb/devices/${BUS}-1/authorized
  fi
fi


cd /home/spr/super/
docker-compose -f $COMPOSE_FILE up -d


ret=$?

if [ "$ret" -ne "0" ]; then
   # upon failure, run dhclient to get an IP and try to pull the containers
   dhclient $WANIF
   docker-compose -f $COMPOSE_FILE pull
   docker-compose -f $COMPOSE_FILE up -d
fi

