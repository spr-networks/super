## Services Overview

#### api 
API for communicating between services over unix sockets and the web front end over http

#### base
Sets up routing, firewall rules, and tunes performance on the pi


#### [dhcp](https://github.com/spr-networks/super/tree/main/dhcp)
Runs [CoreDHCP (golang)](https://github.com/spr-networks/coredhcp) to [dynamically add](https://github.com/spr-networks/super/blob/main/dhcp/scripts/dhcp_helper.sh) devices to the nftable Sets they belong to. For example, dhcp, dns, internet, lan, or custom groups. 

Two plugins were added to support this. The first, [tiny_subnets](https://github.com/spr-networks/coredhcp/tree/master/plugins/tiny_subnets) allows creating /30 subnets and the second, [execute](https://github.com/spr-networks/coredhcp/blob/master/plugins/execute/plugin.go) runs a bash script, [dhcp_helper.sh](https://github.com/spr-networks/super/blob/main/dhcp/scripts/dhcp_helper.sh) upon a DHCP with information about the DHCP request and response.

#### [dns](https://github.com/spr-networks/super/tree/main/dns)

Runs CoreDNS (golang) with custom modules for [ad-blocking](https://github.com/spr-networks/coredns-block), [dns-rebinding protection](https://github.com/spr-networks/coredns-rebinding_protection), and [logging JSON](https://github.com/spr-networks/coredns-jsonlog) to influxdb or postgres. 
A [local](https://github.com/spr-networks/super/blob/main/dhcp/scripts/dhcp_helper.sh#L100) [mappings](https://github.com/spr-networks/super/blob/main/base/template_configs/dns-Corefile#L5) file is used to map DHCP host names to .lan hostnames, for example macbook.lan 

#### [flowgather](https://github.com/spr-networks/super/tree/main/flowgather)
Experimental packet monitoring service geared for forensics, written entirely in golang to keep track of unique network flows, DNS queries, and TLS fingerprints

#### [multicast_udp_server](https://github.com/spr-networks/super/tree/main/multicast_udp_proxy)

Since devices are unable to speak directly to one another, multicast is broken by design with the network architecture. A golang service repeats packets to services with the original sender's address. This currently repeats to all devices. Future work could monitor IGMP to limit noise or create a bipartite graph of IOT devices and users, where devices would not be able to communicate directly with other deviecs. 

#### ppp
This service supports PPP authentication to the ISP. This is useful if SPR is the main router

#### Telegraf
TBD
https://github.com/spr-networks/super/blob/main/monitor-services-compose.yml#L17

#### [wifid](https://github.com/spr-networks/super/tree/main/wifid)
Runs hostapd with a hardened [configuration](https://github.com/spr-networks/super/blob/main/base/template_configs/gen_hostapd.sh) and supports the management of per-station PSKs. It [hands off](https://github.com/spr-networks/super/blob/main/wifid/scripts/action.sh) MAC addresses to dhcp
For DHCP hardening, an [XDP filter](https://github.com/spr-networks/super/blob/main/wifid/code/filter_dhcp_mismatch.c) is applied so that the the layer 2 source addresses matches the client identifier in the layer 3 udp payload for DHCP.

#### watchdog
Restarts the router if there's a failure

#### wireguard
Additional pis can be connected over wireguard. Description TBD. 
