#!/bin/bash

. /configs/base/config.sh

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
    LANIFDHCP="iifname $LANIF udp dport 67 counter accept"
fi

LANIFFORWARD=""
if [ "$LANIF" ]; then
    LANIFFORWARD="oifname $LANIF ip saddr . iifname . ether saddr vmap @lan_access"
fi

WIREGUARD_DNS=""
WIREGUARD_FORWARD=""
if [ "$WIREGUARD_NETWORK" ]; then
  WIREGUARD_DNS="iifname wg0 udp dport 53 counter accept"
  WIREGUARD_FORWARD="iifname wg0 counter accept"
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

    # Allow wireguard from all interfaces
    udp dport $WIREGUARD_PORT counter accept

    # drop dhcp requests, multicast ports from upstream
    iifname $WANIF udp dport {67, 1900, 5353} counter jump DROPLOGINP

    # drop ssh, iperf from upstream
#    iifname $WANIF tcp dport {22, 5201, 80} counter jump DROPLOGINP

    # Allow ssh, iperf3 from LAN
    tcp dport {22, 5201, 80} counter accept

    # Allow multicast
    udp dport {1900, 5353} counter accept

    # DNS Allow rules
    # Docker can DNS
    iif $DOCKERIF ip saddr $DOCKERNET udp dport 53 counter accept

    # wireguard can DNS
    $WIREGUARD_DNS

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
    iif $DOCKERIF oifname $WANIF ip saddr $DOCKERNET counter accept

    # MSS clamping to handle upstream MTU limitations
    tcp flags syn tcp option maxseg size set rt mtu

    # Forward to WAN
    oifname $WANIF ip saddr . iifname . ether saddr vmap @internet_access

    # Forward to wired LAN
    $LANIFFORWARD

    # Forward to wireless LAN
    oifname "$VLANSIF*" ip saddr . iifname . ether saddr vmap @lan_access

    # Forward * from wireguard
    $WIREGUARD_FORWARD

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
    oifname $WANIF counter masquerade
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
