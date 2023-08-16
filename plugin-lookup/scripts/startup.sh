#!/bin/bash

# download lists on startup. if no internet access, sleep 1 min and try again
# run plugin when done
cd /data

while true; do

# ip2asn
curl -O https://iptoasn.com/data/ip2asn-v4.tsv.gz
gunzip -f ip2asn-v4.tsv.gz

# oui
#curl -O https://raw.githubusercontent.com/boundary/wireshark/master/manuf
# more entries but have no short format for vendor, fix this for go pkg
curl -O https://www.wireshark.org/download/automated/data/manuf
grep -q '#\sApple, Inc.' manuf
if [ $? -ne 0 ]; then
	sed -i 's/ \{2,\}/\tspr #/g' manuf
fi

if [ -f /data/ip2asn-v4.tsv ]; then
    break
else
    sleep 60
fi

done

/lookup_plugin
