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
      22: drop,
      80: drop,
      443: drop,
      5201: drop
    }
  }

  map spr_tcp_port_accept {
    type inet_service : verdict;
    elements = {
      22: accept,
      80: accept,
      443: accept,
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

  map fwd_block {
    type ipv4_addr . ipv4_addr . inet_proto . inet_service : verdict;
    flags interval
  }

  # If a client is a part of this group, it will have
  # src_ip : return to succeed
  map upstream_private_rfc1918_allowed {
    type ipv4_addr : verdict;
  }

  # packets will be dropped if
  # the restrict_upstream_private_addresses does not see them
  # in the upstream_private_rfc1918_allowed vmap
  map drop_private_rfc1918 {
    type ipv4_addr  : verdict;
    flags interval
    elements = {
      10.0.0.0/8     : jump restrict_upstream_private_addresses,
      172.16.0.0/12  : jump restrict_upstream_private_addresses,
      192.168.0.0/16 : jump restrict_upstream_private_addresses
    }
  }

  chain PFWDROPLOG {
    counter log prefix "drop:pfw " group 1
    counter drop
  }

  chain INPUT {
    type filter hook input priority 0; policy drop;

    #jump USERDEF_INPUT
    iif lo counter accept
    counter jump F_EST_RELATED

    # for logging - todo LANIFS for each
    $(if [ "$WANIF" ]; then echo "iifname $WANIF log prefix \"lan:in \" group 0"; fi)
    #$(if [ "$LANIF" ]; then echo "iifname \"$LANIF.*\" log prefix \"lan:out \" group 0"; fi)

    # Drop input from the site to site output interfaces. They are only a sink,
    # Not a source that can connect into SPR services
    counter iifname "site*" jump DROPLOGINP

    # Allow wireguard from only WANIF interface to prevent loops
    $(if [ "$WANIF" ]; then echo "iifname $WANIF udp dport $WIREGUARD_PORT counter accept"; fi)

    # drop dhcp requests, multicast ports from upstream
    # When updating lan_udp_accept, updated this list.
    $(if [ "$WANIF" ]; then echo "iifname $WANIF udp dport {67, 1900, 5353} counter jump DROPLOGINP"; fi)


    # drop ssh, iperf from upstream
    $(if [ "$WANIF" ]; then echo "counter iifname $WANIF tcp dport vmap @upstream_tcp_port_drop"; fi)

    # DHCP Allow rules
    # Wired lan
    $(if [ "$LANIF" ]; then echo "iifname $LANIF udp dport 67 counter accept"; fi)

    # Authorized wireless stations & MACs. They do not have an ip address yet
    counter udp dport 67 iifname . ether saddr vmap @dhcp_access

    # Prevent MAC Spoofing from LANIF, wired interfaces
    $(if [ "$LANIF" ]; then echo "iifname eq $LANIF jump DROP_MAC_SPOOF"; fi)

    jump WIPHY_MACSPOOF_CHECK

    # DNS Allow rules
    # Docker can DNS
    $(if [ "$DOCKERIF" ]; then echo "iif $DOCKERIF ip saddr $DOCKERNET udp dport 53 counter accept"; fi)

    # Dynamic verdict map for dns access
    counter udp dport 53  ip saddr . iifname vmap @dns_access

    # Allow ssh, iperf3 from LAN and those not dropped from upstream (see upstream_tcp_port_drop)
    counter tcp dport vmap @spr_tcp_port_accept

    # Allow udp for multicast proxy
    # NOTE, if adding to lan_udp_accept, make sure to update the drop rule above
    counter udp dport vmap @lan_udp_accept

    # Fall through to log + drop
    counter jump DROPLOGINP
  }

  #chain USERDEF_INPUT{
  #}

  #    $(if [ "$VLANSIF" ]; then echo "counter iifname eq "$VLANSIF*" jump DROP_MAC_SPOOF"; fi)
  chain WIPHY_MACSPOOF_CHECK {
  }

  chain FORWARD {
    type filter hook forward priority 0; policy drop;

    #jump USERDEF_FORWARD

    counter jump F_EST_RELATED

    # for logging - todo LANIFS for each
    $(if [ "$WANIF" ]; then echo "iifname $WANIF log prefix \"wan:out \" group 0"; fi)
    #$(if [ "$LANIF" ]; then echo "iifname \"$LANIF.*\" log prefix \"lan:in \" group 0"; fi)

    # Allow DNAT for port forwarding
    counter ct status dnat accept

    # allow docker containers to communicate upstream
    $(if [ "$WANIF" ] && [ "$DOCKERIF" ]; then echo "iif $DOCKERIF oifname $WANIF ip saddr $DOCKERNET counter accept"; fi)
    # allow docker containers to speak to LAN also
    $(if [ "$LANIF" ] && [ "$DOCKERIF" ]; then echo "iif $DOCKERIF oifname $LANIF ip saddr $DOCKERNET counter accept"; fi)

    # Verify MAC addresses for LANIF/WIPHYs
    $(if [ "$LANIF" ]; then echo "iifname eq $LANIF jump DROP_MAC_SPOOF"; fi)
    jump WIPHY_MACSPOOF_CHECK

    # Drop private_rfc1918 access on upstream
    $(if [ "$WANIF" ]; then echo "counter oifname $WANIF ip daddr vmap @drop_private_rfc1918"; fi)

    # MSS clamping to handle upstream MTU limitations
    tcp flags syn tcp option maxseg size set rt mtu

    # Block rules
    counter ip saddr . ip daddr . ip protocol . tcp dport vmap @fwd_block
    counter ip saddr . ip daddr . ip protocol . udp dport vmap @fwd_block

    # Forward to Site VPN if client has internet access
    counter oifname "site*" ip saddr . iifname vmap @internet_access

    # Forward to WAN
    $(if [ "$WANIF" ]; then echo "counter oifname $WANIF ip saddr . iifname vmap @internet_access"; fi)

    # Forward to wired LAN
    $(if [ "$LANIF" ]; then echo "counter oifname $LANIF ip saddr . iifname vmap @lan_access"; fi)

    # Forward @lan_access to wg
    counter oifname wg0 ip saddr . iifname vmap @lan_access

    # Forward to wireless LAN
    jump WIPHY_FORWARD_LAN
    jump CUSTOM_GROUPS

    # Fallthrough to log + drop
    counter jump DROPLOGFWD
  }

  chain restrict_upstream_private_addresses {
    counter ip saddr vmap @upstream_private_rfc1918_allowed
    log prefix "drop:private " group 1
    counter drop
  }

  #    $(if [ "$VLANSIF" ]; then echo "counter oifname "$VLANSIF*" ip saddr . iifname vmap @lan_access"; fi)
  chain WIPHY_FORWARD_LAN {
  }

  #chain USERDEF_FORWARD {
  #}

  chain CUSTOM_GROUPS {

  }

  chain OUTPUT {
    type filter hook output priority 0; policy accept
  }

  chain DROPLOGFWD {
    counter log prefix "drop:forward " group 1
    counter drop
  }

  chain DROPLOGINP {
    counter log prefix "drop:input " group 1
    counter drop
  }

  chain F_EST_RELATED {
    ip protocol udp ct state related,established counter accept
    ip protocol tcp ct state related,established counter accept
    ip protocol icmp ct state related,established counter accept
  }

  chain DROP_MAC_SPOOF {
    counter ip saddr . iifname . ether saddr vmap @ethernet_filter
    log prefix "drop:mac " group 1
    counter drop
  }

}



table inet nat {

  map dnat_tcp_ipmap {
    type ipv4_addr . ipv4_addr . inet_service : ipv4_addr;
    flags interval;
  }

  map dnat_tcp_portmap {
    type ipv4_addr . ipv4_addr . inet_service : inet_service;
    flags interval;
  }

  map dnat_tcp_anymap {
    type ipv4_addr . ipv4_addr : ipv4_addr;
    flags interval;
  }

  map dnat_udp_ipmap {
    type ipv4_addr . ipv4_addr . inet_service : ipv4_addr;
    flags interval;
  }

  map dnat_udp_portmap {
    type ipv4_addr . ipv4_addr . inet_service : inet_service;
    flags interval;
  }

  map dnat_udp_anymap {
    type ipv4_addr . ipv4_addr : ipv4_addr;
    flags interval;
  }


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
    flags interval;
  }

  chain PREROUTING {
    type nat hook prerouting priority -100; policy accept;

    # Block rules
    counter ip saddr . ip daddr . ip protocol  vmap @block

    #jump USERDEF_PREROUTING

    # DNAT Port Forwarding from Upstream to clients
    $(if [ "$WANIF" ]; then echo "counter iifname $WANIF dnat ip addr . port to ip daddr . udp dport map @udpfwd"; fi)
    $(if [ "$WANIF" ]; then echo "counter iifname $WANIF dnat ip addr . port to ip daddr . tcp dport map @tcpfwd"; fi)
    $(if [ "$WANIF" ]; then echo "counter iifname $WANIF ip protocol udp dnat to ip daddr map @udpanyfwd"; fi)
    $(if [ "$WANIF" ]; then echo "counter iifname $WANIF ip protocol tcp dnat to ip daddr map @tcpanyfwd"; fi)

    # Used for DNAT forwarding
    counter ip protocol tcp dnat ip saddr . ip daddr map @dnat_tcp_anymap
    counter ip protocol udp dnat ip saddr . ip daddr map @dnat_udp_anymap

    # Used for rerouting outbound traffic in PFW
    counter ip protocol tcp \
         dnat ip saddr . ip daddr . tcp dport map @dnat_tcp_ipmap : \
              ip saddr . ip daddr . tcp dport map @dnat_tcp_portmap

    counter ip protocol udp \
         dnat ip saddr . ip daddr . udp dport map @dnat_udp_ipmap : \
              ip saddr . ip daddr . udp dport map @dnat_udp_portmap

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

    $(if [ "$WANIF" ]; then echo "oifname $WANIF counter masquerade"; fi)

    # Masquerade site-to-site VPN
    counter oifname "site*" masquerade
  }

  #chain USERDEF_POSTROUTING {
  #}


}

table inet mangle {

  map site_forward_mangle {
    type ipv4_addr . ipv4_addr : verdict;
    flags interval;
  }

  chain PREROUTING {
    type filter hook prerouting priority -150; policy accept;
    counter ip saddr . ip daddr vmap @site_forward_mangle
  }

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
