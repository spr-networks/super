#!/bin/bash
. configs/base/config.sh

cat << END
# Note, this is generated by gen_coredhcp_yaml.sh. Modify that to make changes
server4:
#  Listens on all interfaces when none are configured. Note that iptables should block dhcp from $WANIF
  plugins:
    - tiny_subnets:

END
