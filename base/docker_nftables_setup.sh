#!/bin/bash
# Set up nftables for docker
iptables --flush
iptables -t nat --flush
iptables --delete-chain
iptables -t nat --delete-chain

iptables-legacy --flush
iptables-legacy -t nat --flush
iptables-legacy --delete-chain
iptables-legacy -t nat --delete-chain

. configs/base/config.sh

nft flush ruleset
nft -f - << EOF

table inet filter {
  chain INPUT {
    type filter hook input priority 0; policy accept;
    counter jump F_EST_RELATED

    # Input rules
    iif lo counter accept
  }

  chain FORWARD {
    type filter hook forward priority 0; policy drop;

    counter jump F_EST_RELATED
    iif $DOCKERIF oifname $WANIF ip saddr $DOCKERNET counter accept

    # MSS clamping to handle upstream MTU limitations
    tcp flags syn tcp option maxseg size set rt mtu

  }

  chain OUTPUT {
    type filter hook output priority 0; policy accept
  }

  chain F_EST_RELATED {
    ip protocol udp ct state related,established counter accept
    ip protocol tcp ct state related,established counter accept
    ip protocol icmp ct state related,established counter accept
  }

}

table inet nat {
  chain POSTROUTING {
    type nat hook postrouting priority 100; policy accept;
    oifname $WANIF counter masquerade
  }
}

EOF
