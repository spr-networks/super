#!/bin/bash
. configs/base/config.sh

cat << END
# Note, this is generated by gen_coredhcp_yaml.sh. Modify that to make changes
server4:
#  Listens on all interfaces when none are configured. Note that iptables should block dhcp from $WANIF
  plugins:
    - server_id: $LANIP
    - dns: $DNSIP
    - router: $LANIP
    - netmask: $TINYNETMASK
    - tiny_subnets: /state/dhcp/leases.txt $TINYNETSTART $TINYNETSTOP 730h0m0s
    - execute: /scripts/dhcp_helper.sh

END

