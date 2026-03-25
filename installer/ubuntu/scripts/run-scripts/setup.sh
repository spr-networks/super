#!/bin/bash
### additional SPR setup

set -a
. /spr-environment.sh

ip link set $WANIF up
dhcpcd $WANIF || dhclient $WANIF
dpkg-reconfigure openssh-server

# Resize to full disk
ROOTPART=$(mount | grep " / " | awk '{print $1}')

PART=$(echo $ROOTPART | sed 's/[0-9]*$//')
PART=$(echo $PART | sed 's/p$//')
PARTNUM=$(echo $ROOTPART | sed 's/^.*[^0-9]\([0-9]\+\)$/\1/')

growpart $PART $PARTNUM
resize2fs $ROOTPART

#try docker-compose pull, else, load the offline containers

shopt -s expand_aliases
if ! which docker-compose > /dev/null 2>&1; then
    # Set an alias for docker-compose if it's missing
    alias docker-compose='docker compose'
fi


cd /home/spr/super/

# Find non-conflicting LAN subnet based on current uplink routes
chmod +x ./base/scripts/find_lan_subnet.sh
./base/scripts/find_lan_subnet.sh

# Fix interfaces without permanent MAC addresses
chmod +x ./base/scripts/fix_mac_addresses.sh
./base/scripts/fix_mac_addresses.sh

# Generate self signed SSL certificates
SKIPPASS="-password pass:1234" ./api/scripts/generate-certificate.sh

docker-compose -f $COMPOSE_FILE pull
ret=$?

if [ "$ret" -ne "0" ]; then
  if [ -d /containers ]; then
    cd /containers
      for x in `ls *.tar.gz`
      do
        docker load -i $x
      done
    rm -f /containers
  fi
fi

if grep --quiet Raspberry /proc/cpuinfo; then
  # pi related tasks
  :
else
  mv /lib/udev/rules.d/80-net-setup-link.rules /lib/udev/rules.d/80-net-setup-link.rules.bak
  ln -s /dev/null /lib/udev/rules.d/80-net-setup-link.rules
fi

touch /home/spr/.spr-setup-done
