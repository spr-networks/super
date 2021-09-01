#!/bin/bash
. /configs/config.sh
iptables --flush
iptables -t nat --flush
iptables --delete-chain
iptables -t nat --delete-chain

# NAT rules. Masquerade upstream traffic
iptables -t nat -A POSTROUTING -o $WANIF -j MASQUERADE

# Default drop for both FORWARD and INPUT
iptables -P FORWARD DROP
iptables -P INPUT DROP

#Logging chain
iptables -N DROPLOGINP
iptables -A DROPLOGINP -j LOG --log-prefix "DRP:INP "
iptables -A DROPLOGINP -j DROP

iptables -N DROPLOGFWD
iptables -A DROPLOGFWD -j LOG --log-prefix "DRP:FWD "
iptables -A DROPLOGFWD -j DROP

# Chain to allow returning udp, tcp, icmp NAT/conn track on any interface

iptables -N F_EST_RELATED

iptables -A F_EST_RELATED -p udp -m conntrack --ctstate ESTABLISHED,RELATED  -j ACCEPT
iptables -A F_EST_RELATED -p tcp -m conntrack --ctstate ESTABLISHED,RELATED  -j ACCEPT
iptables -A F_EST_RELATED -p icmp -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT


# accept * for loopback
iptables -A INPUT -i lo -j ACCEPT

#allow returning traffic to all interfaces
iptables -A INPUT -j F_EST_RELATED
iptables -A FORWARD -j F_EST_RELATED

#block dhcp requests from WAN
iptables -A INPUT -i $WANIF -p udp --dport 67 -j DROPLOGINP

# Block everything except for  SSH initially
# DHCP is opened up after installing an XDP filter in the dhcp container

#ssh server on *
iptables -A INPUT -p tcp --dport 22 -j ACCEPT
#iperf3 on *
iptables -A INPUT -p tcp --dport 5201 -j ACCEPT


# Allow SSDP and MDNS on not WANIF
iptables -A INPUT -p udp --dport 1900 -i $WANIF -j DROPLOGINP
iptables -A INPUT -p udp --dport 5353 -i $WANIF -j DROPLOGINP
iptables -A INPUT -p udp --dport 1900 -j ACCEPT
iptables -A INPUT -p udp --dport 5353 -j ACCEPT


# Docker makes some messy iptables. We flushed those and have to make it work again
# Forward docker rules
iptables -A FORWARD -i $DOCKERIF -o $WANIF -s $DOCKERNET -j ACCEPT
# Allow DNS from docker
iptables -A INPUT -i $DOCKERIF -s $DOCKERNET -p udp --dport 53 -j ACCEPT


# Create the standard groups
ipset create dns_iface_access hash:net,iface
ipset create dns_mac_access hash:ip,mac

ipset create internet_iface_access hash:net,iface
ipset create internet_mac_access hash:ip,mac

ipset create lan_mac_access hash:ip,mac
ipset create lan_iface_access hash:net,iface

# Want to verify both the interface and the mac, need a chain with 1 entry to combine two src,src matches
# since ipset takes only the first match for src

# DNS access
iptables -N dns_iface_access
iptables -A dns_iface_access -m set --match-set dns_iface_access src,src -j ACCEPT
iptables -A INPUT -m set --match-set dns_mac_access src,src -p udp --dport 53 -j dns_iface_access

# Forward outbound_devices
iptables -N internet_iface_access
iptables -A internet_iface_access -m set --match-set internet_iface_access src,src -j ACCEPT
iptables -A FORWARD -m set --match-set internet_mac_access src,src -o $WANIF -j internet_iface_access

# Forward LAN access
#wifi VIFs and wired LAN
iptables -N lan_iface_access
iptables -A lan_iface_access -m set --match-set lan_iface_access src,src -j ACCEPT
iptables -A FORWARD -m set --match-set lan_mac_access src,src -o $VLANSIF+ -j lan_iface_access
iptables -A FORWARD -m set --match-set lan_mac_access src,src -o $LANIF -j lan_iface_access


# Allow wireguard
iptables -A INPUT -i $WANIF -p udp --dport $WIREGUARD_PORT -j ACCEPT
iptables -A INPUT -i wg0 -p udp --dport 53 -j ACCEPT
iptables -A FORWARD -i wg0 -j ACCEPT

iptables -A INPUT -j DROPLOGINP

# Reroute external DNS to our own server
iptables -t nat -A PREROUTING -p udp --dport 53 -j DNAT --to-destination 192.168.2.1:53
iptables -t nat -A PREROUTING -p tcp --dport 53 -j DNAT --to-destination 192.168.2.1:53

# Log failed forwarding
iptables -A FORWARD -j DROPLOGFWD
