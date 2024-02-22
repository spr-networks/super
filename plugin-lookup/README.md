# SPR plugin-lookup

This plugin provides api endpoints to query for IP address ASN & MAC address OUI information.

using the plugin:
```sh
curl -u "admin:$PASS" 192.168.2.1/plugins/lookup/asn/1.1.1.1
curl -u "admin:$PASS" 192.168.2.1/plugins/lookup/oui/00:11:22:33:44:55:66
```

For ASN lookups its using this:
https://iptoasn.com/data/ip2asn-v4.tsv.gz

And the OUI vendor list from Wireshark:
https://www.wireshark.org/download/automated/data/manuf

Files are downloaded on startup of the container
