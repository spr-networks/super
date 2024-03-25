#!/bin/bash
### SPR auto-start command

set -a

. /spr-environment.sh

shopt -s expand_aliases
if ! which docker-compose > /dev/null 2>&1; then
    # Set an alias for docker-compose if it's missing
    alias docker-compose='docker compose'
fi

#update the hostname
if [[ -f /etc/hostname && -f /home/spr/super/configs/base/hostname ]]; then
  if ! diff -q <(tr -dc '[:alnum:]-' < /home/spr/super/configs/base/hostname) <(tr -dc '[:alnum:]-' < /etc/hostname); then
    tr -dc '[:alnum:]-' < /home/spr/super/configs/base/hostname > /etc/hostname
    hostname < /etc/hostname
  fi
fi

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
