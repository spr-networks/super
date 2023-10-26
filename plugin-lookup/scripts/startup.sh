#!/bin/bash

# download lists on startup. if no internet access, sleep 1 min and try again
# run plugin when done
cd /data

while true; do

/scripts/download.sh

if [ -f /data/ip2asn-v4.tsv ]; then
    break
else
    sleep 60
fi

done

/lookup_plugin
