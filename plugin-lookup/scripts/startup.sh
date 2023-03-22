#!/bin/bash

# download lists on startup. if no internet access, sleep 1 min and try again
# run plugin when done
cd /data

while true; do

# ip2asn
curl -O https://iptoasn.com/data/ip2asn-v4.tsv.gz
gunzip -f ip2asn-v4.tsv.gz

# oui
curl -O https://gitlab.com/wireshark/wireshark/-/raw/master/manuf

if [ -f /data/ip2asn-v4.tsv ]; then
    break
else
    sleep 60
fi

done

/lookup_plugin
