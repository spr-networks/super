#!/bin/bash

# NOTE
# after running this restart at least base + api containers and
# reconnect to wifi to refresh the nft maps

D="/"

# if run outside of container
if [ ! -d "$D/configs" ]; then
	SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
	D="${SCRIPT_DIR}/../.."
fi

if [ -f "$D/configs/devices/zones.json" ]; then
	echo "+ updating zone files"
	mv $D/configs/devices/zones.json $D/configs/devices/zones.json.bak-upgrade
	mv $D/configs/devices/devices.json $D/configs/devices/devices.json.bak-upgrade
	cat $D/configs/devices/zones.json.bak-upgrade | sed 's/ZoneTags/GroupTags/g' > $D/configs/devices/groups.json
	cat $D/configs/devices/devices.json.bak-upgrade | sed 's/Zones/Groups/g' > $D/configs/devices/devices.json
else
	exit
fi
