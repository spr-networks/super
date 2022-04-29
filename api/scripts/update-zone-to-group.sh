#!/bin/bash

# NOTE
# after running this restart at least base + api containers and
# reconnect to wifi to refresh the nft maps

D="/"

if [ -f "$D/configs/devices/zones.json" ]; then
	echo "+ updating zone files"
	mv $D/configs/devices/zones.json $D/configs/devices/zones.json.bak-upgrade
	mv $D/configs/devices/devices.json $D/configs/devices/devices.json.bak-upgrade
	cat $D/configs/devices/zones.json.bak-upgrade | sed 's/ZoneTags/GroupTags/g' > $D/configs/devices/groups.json
	cat $D/configs/devices/devices.json.bak-upgrade | sed 's/Zones/Groups/g' > $D/configs/devices/devices.json
else
	#echo "+ already updated"
	exit
fi
