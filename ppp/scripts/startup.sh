#!/bin/bash

jq -r '.PPPs[] |
  "PPPIF=" + .Iface ,
  "PPPIFNAME=" + .PPPIface ,
  "PPP_VLANID=" + .VLAN ,
  "if [ \"$PPPIF\" ]; then" ,
  "if [ \"$PPP_VLANID\" ]; then",
  "ip link add link $PPPIF name $PPPIF.$PPP_VLANID type vlan id $PPP_VLANID",
  "ip link set up dev $PPPIF.$PPP_VLANID",
  "fi",
  "ip link set up dev $PPPIF",
  "/usr/sbin/pppd call provider_${PPPIF} ifname $PPPIFNAME 2>&1",
  "fi"' /etc/ppp/ppp.json  |  bash

sleep inf
