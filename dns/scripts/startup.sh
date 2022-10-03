#!/bin/bash
# Do not run DNS in mesh mode
if [ ! -f state/plugins/mesh/enabled ]; then
  /coredns -conf /configs/dns/Corefile
fi
