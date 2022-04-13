#!/bin/bash

# download lists on startup
cd /data

# ip2asn
curl -O https://iptoasn.com/data/ip2asn-v4.tsv.gz
gunzip ip2asn-v4.tsv.gz

# oui
curl -O https://gitlab.com/wireshark/wireshark/-/raw/master/manuf

/lookup_plugin
