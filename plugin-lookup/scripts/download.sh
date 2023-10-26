#!/bin/bash

# ip2asn
curl -s -O https://iptoasn.com/data/ip2asn-v4.tsv.gz
gunzip -f ip2asn-v4.tsv.gz

# oui
#curl -O https://raw.githubusercontent.com/boundary/wireshark/master/manuf
# more entries but have no short format for vendor, fix this for go pkg
curl -s -O https://www.wireshark.org/download/automated/data/manuf
grep -q '#\sApple, Inc.' manuf
if [ $? -ne 0 ]; then
    cat manuf | grep -v '^#' | awk '{print $1 "\t" $2 "\t" "# " $3 " " $4 " " $5}' > manuf.new && mv manuf.new manuf
fi
