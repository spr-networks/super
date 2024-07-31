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
  :
else
  # TBD check the story for clearfog
  mv /lib/udev/rules.d/80-net-setup-link.rules /lib/udev/rules.d/80-net-setup-link.rules.bak
  ln -s /dev/null /lib/udev/rules.d/80-net-setup-link.rules
fi

touch /home/spr/.spr-setup-done

# Reset the `ubuntu` password to the admin password when a user enables one
# We only attempt this on the first setup, once.,
watch_setup_done() {
    dir_to_watch="/home/spr/super/configs/"
    file_to_watch=".setup_done"

    while true; do
        if inotifywait -q -e create,modify,move "$dir_to_watch"; then
            if [[ -f "$dir_to_watch/$file_to_watch" ]]; then
                P=$(cat configs/auth/auth_users.json  | jq -r .admin)
                (echo $P; echo $P)| passwd ubuntu
                break
            fi
        fi
    done
}

watch_setup_done &
