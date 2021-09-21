#!/bin/bash

. /configs/config.sh

# Clean previous rules
iptables --flush
iptables -t nat --flush
iptables --delete-chain
iptables -t nat --delete-chain

iptables-legacy --flush
iptables-legacy -t nat --flush
iptables-legacy --delete-chain
iptables-legacy -t nat --delete-chain

nft flush ruleset

LANIFDHCP=""
if [ "$LANIF" ]; then
    LANIFDHCP="iif $LANIF udp dport 67 counter accept"
fi

LANIFFORWARD=""
if [ "$LANIFFORWARD" ]; then
    LANIFFORWARD="oif $LANIF ip saddr . iifname . ether saddr vmap @lan_access"
fi

nft -f - << EOF

table inet filter {
  # Dynamic maps of clients
  map dhcp_access {
    type ifname . ether_addr: verdict;
  }

  map dns_access {
    type ipv4_addr . ifname . ether_addr: verdict;
  }

  map internet_access {
    type ipv4_addr . ifname . ether_addr: verdict;
  }

  map lan_access {
    type ipv4_addr . ifname . ether_addr: verdict;
  }


  chain INPUT {
    type filter hook input priority 0; policy drop;

    # Input rules
    iif lo counter accept
    counter jump F_EST_RELATED

    # Allow wireguard from upstream
    iif $WANIF udp dport 51280 counter accept

    # drop dhcp requests, multicast ports from upstream
    iif $WANIF udp dport {67, 1900, 5353} counter jump DROPLOGINP

    # Allow ssh, iperf3
    tcp dport {22, 5201} counter accept

    # Allow multicast
    udp dport {1900, 5353} counter accept

    # DNS Allow rules
    # Docker can DNS
    iif $DOCKERIF ip saddr $DOCKERNET udp dport 53 counter accept

    # wireguard can DNS
    iif wg0 udp dport 53 counter accept

    # Dynamic verdict map
    udp dport 53  ip saddr . iifname . ether saddr vmap @dns_access

    # DHCP Allow rules
    # Wired lan
    $LANIFDHCP

    # Authorized wireless stations & MACs. They do not have an ip address yet
    udp dport 67 iifname . ether saddr vmap @dhcp_access

    # Fall through to log + drop
    counter jump DROPLOGINP
  }

  chain FORWARD {
    type filter hook forward priority 0; policy drop;

    counter jump F_EST_RELATED
    iif $DOCKERIF oif $WANIF ip saddr $DOCKERNET counter accept

    # Forward to WAN
    oif $WANIF ip saddr . iifname . ether saddr vmap @internet_access

    # Forward to wired LAN
    $LANIFFORWARD

    # Forward to wireless LAN
    oifname "$VLANSIF*" ip saddr . iifname . ether saddr vmap @lan_access

    # Forward * from wireguard
    iif wg0 counter accept

    # Fallthrough to log + drop
    counter jump DROPLOGFWD
  }

  chain OUTPUT {
    type filter hook output priority 0; policy accept
  }

  chain DROPLOGFWD {
    counter log prefix "DRP:FWD "
    counter drop
  }

  chain DROPLOGINP {
    counter log prefix "DRP:INP "
    counter drop
  }

  chain F_EST_RELATED {
    ip protocol udp ct state related,established counter accept
    ip protocol tcp ct state related,established counter accept
    ip protocol icmp ct state related,established counter accept
  }

}





table inet nat {
  chain PREROUTING {
    type nat hook prerouting priority -100; policy accept;

    # Reroute external DNS to our own server
    udp dport 53 counter dnat ip to $DNSIP:53
    tcp dport 53 counter dnat ip to $DNSIP:53
  }
  chain INPUT {
    type nat hook input priority 100; policy accept;
  }
  chain OUTPUT {
    type nat hook output priority -100; policy accept;
  }
  chain POSTROUTING {
    type nat hook postrouting priority 100; policy accept;
    # Masquerade upstream traffic
    oif $WANIF counter masquerade
  }
}

table inet mangle {
  chain PREROUTING {
    type filter hook prerouting priority -150; policy accept;
  }
  chain INPUT {
    type filter hook prerouting priority -150; policy accept;
  }
  chain FORWARD {
    type filter hook prerouting priority -150; policy accept;
  }
  chain OUTPUT {
    type filter hook prerouting priority -150; policy accept;
  }
  chain POSTROUTING {
    type filter hook prerouting priority -150; policy accept;
  }
  chain DIVERT {
  }
}


EOF
