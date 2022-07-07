#!/bin/bash
### additional SPR setup

set -a
. /spr-environment.sh

ip link set $WANIF up
dhclient $WANIF
dpkg-reconfigure openssh-server

echo {\"${ADMIN_USER}\" : \"${ADMIN_PASSWORD}\"} > /home/spr/super/configs/base/auth_users.json


touch /home/spr/.spr-setup-done

# Resize to full disk
ROOTPART=$(df | grep " /$" | awk '{print $1}')
PART=$(echo $ROOTPART | grep -o -E "[^0-9]+")
PARTNUM=$(echo $ROOTPART | grep -o -E "[0-9]+")
growpart $PART $PARTNUM
resize2fs $ROOTPART
