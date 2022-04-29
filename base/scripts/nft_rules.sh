#!/bin/bash

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
DOCKERLAN=""
LANIFFORWARD=""
WGLANIFFORWARD=""
LANIFMACSPOOF=""
if [ "$LANIF" ]; then
    LANIFDHCP="iifname $LANIF udp dport 67 counter accept"
    DOCKERLAN="iif $DOCKERIF oifname $LANIF ip saddr $DOCKERNET counter accept"
    LANIFFORWARD="counter oifname $LANIF ip saddr . iifname . ether saddr vmap @lan_access"
    WGLANIFFORWARD="counter oifname wg0 ip saddr . iifname . ether saddr vmap @lan_access"
    LANIFMACSPOOF="iifname eq $LANIF jump DROP_MAC_SPOOF"
fi

nft -f - << EOF

table inet filter {
  # Dynamic maps of clients
  map dhcp_access {
    type ifname . ether_addr: verdict;
  }

  map ethernet_filter {
    type ipv4_addr . ifname . ether_addr : verdict;
  }

  map dns_access {
    type ipv4_addr . ifname: verdict;
  }

  map internet_access {
    type ipv4_addr . ifname: verdict;
  }

  map lan_access {
    type ipv4_addr . ifname: verdict;
  }

  map upstream_tcp_port_drop {
    type inet_service : verdict;
    elements = {
      80: drop,
      22: drop,
      5201: drop
    }
  }

  map lan_tcp_port_accept {
    type inet_service : verdict;
    elements = {
      80: accept,
      22: accept,
      5201: accept
    }
  }

  map lan_udp_accept {
    type inet_service : verdict;
    elements = {
      1900: accept,
      5353: accept
    }
  }

  chain INPUT {
    type filter hook input priority 0; policy drop;

    #jump USERDEF_INPUT
    iif lo counter accept
    counter jump F_EST_RELATED

    # Allow wireguard from only WANIF interface to prevent loops
    iifname $WANIF udp dport $WIREGUARD_PORT counter accept

    # drop dhcp requests, multicast ports from upstream
    iifname $WANIF udp dport {67, 1900, 5353} counter jump DROPLOGINP

    # drop ssh, iperf from upstream
    counter iifname $WANIF tcp dport vmap @upstream_tcp_port_drop

    # DHCP Allow rules
    # Wired lan
    $LANIFDHCP

    # Authorized wireless stations & MACs. They do not have an ip address yet
    counter udp dport 67 iifname . ether saddr vmap @dhcp_access

    # Prevent MAC Spoofing from LANIF, VLANSIF
    $LANIFMACSPOOF
    counter iifname eq "$VLANSIF*" jump DROP_MAC_SPOOF

    # DNS Allow rules
    # Docker can DNS
    iif $DOCKERIF ip saddr $DOCKERNET udp dport 53 counter accept

    # Dynamic verdict map for dns access
    counter udp dport 53  ip saddr . iifname vmap @dns_access

    # Allow ssh, iperf3 from non WAN interfaces (see upstream_tcp_port_drop)
    counter tcp dport vmap @lan_tcp_port_accept

    # Allow udp for multicast proxy
    counter udp dport vmap @lan_udp_accept

    # Fall through to log + drop
    counter jump DROPLOGINP
  }

  #chain USERDEF_INPUT{
  #}

  chain FORWARD {
    type filter hook forward priority 0; policy drop;

    #jump USERDEF_FORWARD

    counter jump F_EST_RELATED

    # Allow DNAT for port forwarding
    counter ct status dnat accept

    iif $DOCKERIF oifname $WANIF ip saddr $DOCKERNET counter accept
    # allow docker containers to speak to LAN also
    $DOCKERLAN

    $LANIFMACSPOOF
    iifname eq "$VLANSIF*" jump DROP_MAC_SPOOF

    # MSS clamping to handle upstream MTU limitations
    tcp flags syn tcp option maxseg size set rt mtu

    # Forward to WAN
    counter oifname $WANIF ip saddr . iifname vmap @internet_access

    # Forward to wired LAN
    $LANIFFORWARD

    #forward LAN to wg -> Tbd test me
    $WGLANIFFORWARD

    # Forward to wireless LAN
    counter oifname "$VLANSIF*" ip saddr . iifname vmap @lan_access

    jump CUSTOM_GROUPS

    # Fallthrough to log + drop
    counter jump DROPLOGFWD
  }

  #chain USERDEF_FORWARD {
  #}

  chain CUSTOM_GROUPS {

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

  chain DROP_MAC_SPOOF {
  	counter ip saddr . iifname . ether saddr vmap @ethernet_filter
    log prefix "DRP:MAC "
    counter drop
  }

}



table inet nat {

  map udpfwd {
    type ipv4_addr . inet_service : ipv4_addr . inet_service;
    flags interval;
  }

  map tcpfwd {
    type ipv4_addr . inet_service : ipv4_addr . inet_service;
    flags interval;
  }

  map udpanyfwd {
    type ipv4_addr : ipv4_addr;
  }

  map tcpanyfwd {
    type ipv4_addr : ipv4_addr;
  }

  map block {
    type ipv4_addr . ipv4_addr . inet_proto : verdict
  }

  chain PREROUTING {
    type nat hook prerouting priority -100; policy accept;

    # Block rules
    counter ip saddr . ip daddr . ip protocol  vmap @block

    #jump USERDEF_PREROUTING

    # Forwarding dnat maps
    counter dnat ip addr . port to ip daddr . udp dport map @udpfwd
    counter dnat ip addr . port to ip daddr . tcp dport map @tcpfwd

    counter ip protocol udp dnat to ip daddr map @udpanyfwd
    counter ip protocol tcp dnat to ip daddr map @tcpanyfwd

    # Reroute external DNS to our own server
    udp dport 53 counter dnat ip to $DNSIP:53
    tcp dport 53 counter dnat ip to $DNSIP:53
  }

  #chain USERDEF_PREROUTING {
  #}


  chain INPUT {
    type nat hook input priority 100; policy accept;
  }
  chain OUTPUT {
    type nat hook output priority -100; policy accept;
  }
  chain POSTROUTING {
    type nat hook postrouting priority 100; policy accept;

    #jump USERDEF_POSTROUTING

    # Masquerade upstream traffic
    oifname $WANIF counter masquerade
  }

  #chain USERDEF_POSTROUTING {
  #}


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
