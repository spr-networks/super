#!/bin/bash

#TBD:
#
#- create PBR for load balacning across WAN interfaces for outbound  traffic
#- can F_EST_RELATED be moved past MAC spoof check

# Disable forwarding
sysctl net.ipv4.ip_forward=0

# Drop input
iptables -P INPUT DROP

# Empty flow table
conntrack -D

# Clean previous rules
iptables --flush
iptables -t nat --flush
iptables --delete-chain
iptables -t nat --delete-chain

iptables-legacy --flush
iptables-legacy -t nat --flush
iptables-legacy --delete-chain
iptables-legacy -t nat --delete-chain

#collect subnet of docker $WANIF interface when in VIRTUAL mode
WAN_NET=""
if [[ -z "$VIRTUAL_SPR_API_INTERNET" && "$WANIF" && "$VIRTUAL_SPR" ]]
then
  WAN_NET=$(ip -br addr show dev $WANIF | awk '{print $3}')
fi

nft flush ruleset

nft -f - << EOF

table inet filter {
  # this set contains uplink interfaces wired or wireless even
  # dynamically updated for multi-wan
  set uplink_interfaces {
    type ifname;
    $(if [ "$WANIF" ]; then echo "elements = { $WANIF }" ; fi )
  }

  # this set contains wired lan, wired vlan, and wireless vlan clients
  # dynamically updated
  set lan_interfaces {
    type ifname;
    $(if [ "$LANIF" ]; then echo "elements = { $LANIF }" ; fi )
  }

  # this set contains only the wired interfaces, for DHCP whitelisting.
  # without knowing the mac address for dhcp_access ahead of time.
  # VLANs are *not* placed here as VLANs are currently 1:1 per device.
  # but VLANs make it into dhcp_access
  set wired_lan_interfaces {
    type ifname;
    $(if [ "$LANIF" ]; then echo "elements = { $LANIF }" ; fi )
  }

  set dockerifs {
    type ifname;
    $(if [ "$DOCKERIF" ]; then echo "elements = { $DOCKERIF }" ; fi )
  }

  # dynamically updated -- list of lan networks to pick client subnets from
  set supernetworks {
    type ipv4_addr;
    flags interval;
  }

  # Dynamic maps of clients
  # This is used to whitelist mac addresses to interfaces to block
  # spoofing during DHCP requests
  map dhcp_access {
    type ifname . ether_addr: verdict;
  }

  # filter for mac spoofing protection
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

  map ping_rules {
    type ipv4_addr . ifname: verdict;
    flags interval;
  }

  map wan_tcp_accept {
    type inet_service : verdict;
  }

  map lan_tcp_accept {
    type inet_service : verdict;
    elements = {
      22: accept,
      80: accept,
      443: accept,
      5201: accept
    }
  }

  map multicast_lan_udp_accept {
    type inet_service : verdict;
  }

  map multicast_wan_udp_accept {
    type inet_service : verdict;
  }

  map wan_udp_accept {
    type inet_service : verdict;
  }

  map lan_udp_accept {
    type inet_service : verdict;
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

  # Forwarding to Endpoint Service definitions
  map ept_udpfwd {
    type ipv4_addr . ipv4_addr . inet_service : verdict ;
    flags interval;
  }

  map ept_tcpfwd {
    type ipv4_addr . ipv4_addr . inet_service : verdict ;
    flags interval;
  }

  chain PFWDROPLOG {
    counter log prefix "drop:pfw " group 1
    counter drop
  }

  chain LOG_WAN_IN {
    log prefix "wan:in " group 0
  }

  chain LOG_LAN_IN {
    log prefix "lan:in " group 0
  }


  chain INPUT {
    type filter hook input priority 0; policy drop;

    #jump USERDEF_INPUT
    iif lo counter accept

    # Mark whether the input came from upstream (wan:in) or local network (lan:in)
    iifname @uplink_interfaces log prefix "wan:in " group 0
    iifname != @uplink_interfaces log prefix "lan:in " group 0

    # Drop input from the site to site output interfaces. They are only a sink,
    # Not a source that can connect into SPR services
    counter iifname "site*" goto DROPLOGINP

    # Allow wireguard from only WANIF interfaces to prevent loops
    iifname @uplink_interfaces udp dport $WIREGUARD_PORT counter accept

    # drop dhcp requests from upstream
    iifname @uplink_interfaces udp dport {67} counter goto DROPLOGINP

    # Extra hardening for API port 80 when running Virtual SPR, to avoid exposing API to the internet
    # https://github.com/moby/moby/issues/22054 This is an open issue with docker leaving forwarding open...
    # Can disable this hardening by setting VIRTUAL_SPR_API_INTERNET=1
    $(if [ "$VIRTUAL_SPR_API_INTERNET" ]; then echo "" ;  elif [[ "$WAN_NET" ]]; then echo "counter iifname @uplink_interfaces tcp dport 80 ip saddr != $WAN_NET drop"; fi)

    counter jump F_EST_RELATED

    # DHCP Allow rules
    # Wired lan
    iifname @wired_lan_interfaces udp dport 67 counter accept

    # Authorized wireless stations & MACs. They do not have an ip address yet
    counter udp dport 67 iifname . ether saddr vmap @dhcp_access

    # Prevent MAC Spoofing from LANIF, wired interfaces
    iifname @lan_interfaces jump DROP_MAC_SPOOF

    # DNS Allow rules
    # Docker can DNS
    $(if [ "$DOCKERIF" ]; then echo "iif $DOCKERIF ip saddr $DOCKERNET udp dport 53 counter accept"; fi)

    # Dynamic verdict map for dns access
    counter udp dport 53  ip saddr . iifname vmap @dns_access

    # TCP services
    iifname @lan_interfaces counter tcp dport vmap @lan_tcp_accept
    iifname @uplink_interfaces counter tcp dport vmap @wan_tcp_accept

    # UDP services
    iifname @lan_interfaces counter udp dport vmap @lan_udp_accept
    iifname @uplink_interfaces counter udp dport vmap @wan_udp_accept

    # Allow udp for multicast proxy
    # Note: the multicast proxy will filter the ip address, the firewall only needs
    # to know the port and interface combo to allow.
    ip daddr 224.0.0.0/4 iifname @lan_interfaces counter udp dport vmap @multicast_lan_udp_accept
    ip daddr 224.0.0.0/4 iifname @uplink_interfaces counter udp dport vmap @multicast_wan_udp_accept

    icmp type { echo-reply, echo-request } ip saddr . iifname vmap @ping_rules

    # Fall through to log + drop
    counter goto DROPLOGINP
  }

  #chain USERDEF_INPUT{
  #}

  chain FORWARD {
    type filter hook forward priority 0; policy drop;

    # MSS clamping to handle upstream MTU limitations
    tcp flags syn tcp option maxseg size set rt mtu

    # Block rules
    counter ip saddr . ip daddr . ip protocol . tcp dport vmap @fwd_block
    counter ip saddr . ip daddr . ip protocol . udp dport vmap @fwd_block

    #jump USERDEF_FORWARD


    # Extra hardening for when running Virtual SPR, to avoid exposing API to the uplink hop
    # https://github.com/moby/moby/issues/22054 This is an open issue with docker leaving forwarding open...
    # Can disable this hardening by setting VIRTUAL_SPR_API_INTERNET=1
    $(if [ "$VIRTUAL_SPR_API_INTERNET" ]; then echo "" ;  elif [[ "$WANIF" && "$WAN_NET" ]]; then echo "counter iifname @uplink_interfaces tcp dport 80 ip saddr != $WAN_NET goto DROPLOGFWD"; fi)

    # Allow DNAT for port forwarding
    counter ct status dnat accept

    counter jump F_EST_RELATED

    # Do not forward from uplink interfaces after dnat
    # and after F_EST_RELATED
    iifname @uplink_interfaces goto DROPLOGFWD

    # Log after F_EST_RELATED to reduce logs

    # mark outbound for upstream with wan:out and others as lan:out
    oifname @uplink_interfaces log prefix "wan:out " group 0
    oifname != @uplink_interfaces log prefix "lan:out " group 0

    # allow docker containers to communicate upstream
    $(if [ "$DOCKERIF" ]; then echo "iifname @dockerifs oifname @uplink_interfaces ip saddr $DOCKERNET counter accept" ; fi )


    # allow docker containers to speak to LAN also
    $(if [ "$DOCKERIF" ]; then echo "iifname @dockerifs oifname @lan_interfaces  ip saddr $DOCKERNET counter accept" ; fi )

    # Verify MAC addresses for LANIF/WIPHYs
    iifname @lan_interfaces jump DROP_MAC_SPOOF

    # After MAC SPOOF check, but before rfc1918 check
    # These rules allow permits via endpoint verdict maps
    counter ip saddr . ip daddr . udp dport vmap @ept_udpfwd
    counter ip saddr . ip daddr . tcp dport vmap @ept_tcpfwd

    # Drop private_rfc1918 access on upstream
    counter oifname @uplink_interfaces ip daddr vmap @drop_private_rfc1918

    # Forward to Site VPN if client has internet access
    counter oifname "site*" ip saddr . iifname vmap @internet_access

    # Forward to uplink interfaces
    # TBD NOW: needs PBR.
    counter oifname @uplink_interfaces ip saddr . iifname vmap @internet_access

    # The @lan_access dynamic verdict map implements the special LAN group in SPR.
    # It and allows one-way access to all stations, without an explicit relationship by IP,
    #  with a NAT return path (F_EST_RELATED)

    # 1. Transmit to the LANIF interface
    counter oifname @lan_interfaces ip saddr . iifname vmap @lan_access

    # 2. Transmit to the wireguard interface
    counter oifname wg0 ip saddr . iifname vmap @lan_access

    # 3. Forward to wireless stations. This verdict map is managed in firewall.go
    jump WIPHY_FORWARD_LAN

    # Custom groups. Managed in firewall.go
    jump CUSTOM_GROUPS

    # Fallthrough to log + drop
    counter goto DROPLOGFWD
  }

  chain restrict_upstream_private_addresses {
    counter ip saddr vmap @upstream_private_rfc1918_allowed
    log prefix "drop:private " group 1
    counter drop
  }

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
  # see description above. duplicated since nftables doesnt have cross-table sets
  set uplink_interfaces {
    type ifname;
    $(if [ "$WANIF" ]; then echo "elements = { $WANIF }" ; fi )
  }

  # see description above. duplicated since nftables doesnt have cross-table sets
  set lan_interfaces {
    type ifname;
    $(if [ "$LANIF" ]; then echo "elements = { $LANIF }" ; fi )
  }

  # see description above. duplicated since nftables doesnt have cross-table sets
  set dockerifs {
    type ifname;
    $(if [ "$DOCKERIF" ]; then echo "elements = { $DOCKERIF }" ; fi )
  }

  map upstream_supernetworks_drop {
    type ifname . ipv4_addr : verdict;
    flags interval;
  }

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

    # DROP supernetwork src ips from uplinks
    counter iifname . ip saddr vmap @upstream_supernetworks_drop

    # Block rules
    counter ip saddr . ip daddr . ip protocol  vmap @block

    #jump USERDEF_PREROUTING

    # DNAT Port Forwarding from Upstream to clients
    counter iifname @uplink_interfaces dnat ip addr . port to ip daddr . udp dport map @udpfwd
    counter iifname @uplink_interfaces dnat ip addr . port to ip daddr . tcp dport map @tcpfwd
    counter iifname @uplink_interfaces ip protocol udp dnat to ip daddr map @udpanyfwd
    counter iifname @uplink_interfaces ip protocol tcp dnat to ip daddr map @tcpanyfwd

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
    udp dport 53 jump DNS_DNAT
    tcp dport 53 jump DNS_DNAT
  }

  chain DNS_DNAT {
    udp dport 53 counter dnat ip to $LANIP:53
    tcp dport 53 counter dnat ip to $LANIP:53
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
    oifname @uplink_interfaces counter masquerade

    # Masquerade site-to-site VPN
    counter oifname "site*" masquerade
  }

  #chain USERDEF_POSTROUTING {
  #}


}

table inet mangle {

  # see description above. duplicated since nftables doesnt have cross-table sets
  set uplink_interfaces {
    type ifname;
    $(if [ "$WANIF" ]; then echo "elements = { $WANIF }" ; fi )
  }

  # see description above. duplicated since nftables doesnt have cross-table sets
  map site_forward_mangle {
    type ipv4_addr . ipv4_addr : verdict;
    flags interval;
  }

  # see description above. duplicated since nftables doesnt have cross-table sets
  set supernetworks {
    type ipv4_addr;
    flags interval;
  }

  chain OUTBOUND_UPLINK {
  }


  chain PREROUTING {
    type filter hook prerouting priority -150; policy accept;

    # handle site-vpn marks first
    counter ip saddr . ip daddr vmap @site_forward_mangle

    # then go to load balancing if applied
    jump OUTBOUND_UPLINK

    #falls through into accept
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

# Enable forwarding
sysctl net.ipv4.ip_forward=1

# Enable ARP filter
sysctl net.ipv4.conf.all.arp_filter=1

# Enable input again
iptables -P INPUT ACCEPT
