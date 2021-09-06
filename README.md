# A Secure Programmable Router

## Introduction

This project creates a hardened router setup for connecting IOT devices. 
By employing per-station passphrases and strict firewall rules, a hardened network is created.
There project enables a high degree of confidence about where packets come from and where they can actually go.

## The Network Design

Each device on the network is sequestered into a tiny subnet, and all devices must communicate through the router to communicate with one another. 
Groups are used to inform nftable sets about a device's network address, by MAC address and IP address.

The firewall rules are in https://github.com/SPR-FI/super/blob/main/base/scripts/nft_rules.sh

The forwarding and input policies are default drop.

The following ports are exposed to WAN:
- sshd (tcp 22), iperf3 (tcp 5201) # for development
- wireguard (udp 51280)
On LAN the following services are available
- DHCP tied to the authenticated MAC address over WiFi or all wired LAN devices
- DNS for devices in the dns_access group
- 1900, 5353 multicast repeater to all devices for SSDP and MDNS

Routing to the LAN or WAN only happens for authenticated, approved MAC addresses.

## Services Overview

#### base
Sets up routing, firewall rules, and tunes performance on the pi

#### [wifid](https://github.com/SPR-FI/super/tree/main/wifid)
Runs hostapd with a hardened [configuration](https://github.com/SPR-FI/super/blob/main/base/template_configs/gen_hostapd.sh) and supports the management of per-station PSKs. It [hands off](https://github.com/SPR-FI/super/blob/main/wifid/scripts/action.sh) MAC addresses to dhcp

#### [dhcp](https://github.com/SPR-FI/super/tree/main/dhcp)
Runs CoreDHCP (golang) and [netplug scripts](https://github.com/SPR-FI/super/blob/main/dhcp/scripts/netplug) to [dynamically add](https://github.com/SPR-FI/super/blob/main/dhcp/scripts/dhcp_helper.sh) devices to the Sets they belong to. For example, dhcp, dns, internet, lan, or custom groups. For DHCP hardening, an [XDP filter](https://github.com/SPR-FI/super/blob/main/dhcp/code/filter_dhcp_mismatch.c) is applied so that the the layer 2 source addresses matches the client identifier in the layer 3 udp payload for DHCP

Two plugins were added to support this. The first, [tiny_subnets](https://github.com/SPR-FI/coredhcp/tree/master/plugins/tiny_subnets) allows creating /30 subnets and the second, [execute](https://github.com/SPR-FI/coredhcp/blob/master/plugins/execute/plugin.go) runs a bash script, [dhcp_helper.sh](https://github.com/SPR-FI/super/blob/main/dhcp/scripts/dhcp_helper.sh) upon a DHCP with information about the DHCP request and response.

#### [dns](https://github.com/SPR-FI/super/tree/main/dns)

Runs CoreDNS (golang) with custom modules for [ad-blocking](https://github.com/SPR-FI/coredns-block), [dns-rebinding protection](https://github.com/SPR-FI/coredns-rebinding_protection), and [logging JSON](https://github.com/SPR-FI/coredns-jsonlog) to influxdb or postgres. 
A [local](https://github.com/SPR-FI/super/blob/main/dhcp/scripts/dhcp_helper.sh#L100) [mappings](https://github.com/SPR-FI/super/blob/main/base/template_configs/dns-Corefile#L5) file is used to map DHCP host names to .lan hostnames, for example macbook.lan 

#### [multicast_udp_server](https://github.com/SPR-FI/super/tree/main/multicast_udp_proxy)

Since devices are unable to speak directly to one another, multicast is broken by design. A golang service repeats packets to services with the original sender's address. This currently repeats to all devices. Future work could monitor IGMP to limit noise or create a bipartite graph of IOT devices and users, where devices would not be able to communicate directly with other deviecs. 

#### wireguard
Additional pis can be connected over wireguard. Description TBD. 

#### [flowgather](https://github.com/SPR-FI/super/tree/main/flowgather)
Experimental packet monitoring service geared for forensics, written entirely in golang to keep track of unique network flows, DNS queries, and TLS fingerprints

#### Telegraf
TBD
https://github.com/SPR-FI/super/blob/main/monitor-services-compose.yml#L17

## Building:

All source code can be built on the pi with 
./build_docker_compose.sh


## Configuration

The current setup assumes you'll be using a raspberry pi model 4b with a AWUS036ACM wireless dongle (wlan1) 
and an additional usb ethernet dongle (eth1) connected to a switch for additional wired devices.
The built-in ethernet port of the raspberry pi (eth0) is connected to upstream/WAN/internet

Hardware requirements:
- At least an 8GB SD card is required, probably 16GB is better and 128gb for development work is best.
- A WiFi Dongle for better performance and WPA3 support (https://www.alfa.com.tw/products/awus036acm and https://www.netgear.com/home/wifi/adapters/a6210/ have been tested to be good and both use the mt76x2u driver)
- A USB WiFi Dongle for additional LAN devices since the built-in port (eth1) will be used for the WAN. https://www.tp-link.com/us/home-networking/usb-converter/ue300/ Is good

### Base System Setup

1. Set up the pi with ubuntu server https://ubuntu.com/download/raspberry-pi/thank-you?version=21.04&architecture=server-arm64+raspi
```
# Example from mac
$ mac xzcat ubuntu-21.04-preinstalled-server-arm64+raspi.img.xz | dd of=/dev/rdisk2 bs=$[1024*1024]
# On the booted pi
sudo -s
touch /etc/cloud/cloud-init.disabled
apt-get update
sudo apt-get upgrade
sudo apt-get install docker.io docker-compose 
# get rid of `predictable` interface names to get eth0, eth1, wlan0, wlan1 instead.
mv /lib/udev/rules.d/80-net-setup-link.rules /lib/udev/rules.d/80-net-setup-link.rules.bak
ln -s /dev/null  /lib/udev/rules.d/80-net-setup-link.rules
# Add a bug fix for scatter/gather bugs with USB:  
echo mt76-usb disable_usb_sg=1 >> /etc/modules

# do not use systemd-resolvd, we will use our own container later
systemctl disable systemd-resolved
systemctl stop systemd-resolved
rm /etc/resolv.conf
echo "nameserver 1.1.1.1" > /etc/resolv.conf

reboot
```

### Configuring the project


```bash
git clone https://github.com/SPR-FI/super.git 
cd super 
# To get started, copy base/template_configs to configs/:
cp -R base/template_configs configs
```

Then modify configs/config.sh to set an SSID_NAME and configure any networking specifics 

Next, set some station passwords. For WPA3, copy sae_passwords.sample to sae_passwords and add your devices
For WPA2 passwords (since many devices will not support WPA2 yet), copy wpa2pskfile.sample to wpa2pskfile and set your passwords there.

Lastly, modify configs/zones/ and set which MAC addresses are allowed which level of access
The default zones:
```
# This is the default, no devices have to be added to be treated as such. No DNS access, no LAN access, no internet
- isolated 
# Allows DNS access as well as talking to all LAN devices (wireless and wired LAN)
- lan_only 
# Allows internet/WAN forwareding on top of the above
- wan_lan
# Allows internet access but no lan access
- wan_only 
# Placeholder for future privileged services, Currently equivalent to the above
- wan_lan_admin 
```

The groups directory can be used to create sets of devices that can communicate amongst themselves if a device does not need full LAN access. 

### Building the project
```
./build_docker_compose.sh 
```

After initially building, disable Docker's iptable setup, so docker restarts dont mess with the firewall. Write the following to /etc/docker/daemon.json
```
{
  "iptables": false
}
7. Optionally, use our own coredns for DNS. The container will need to be running 
8. 
echo nameserver 127.0.0.1 > /etc/resolv.conf

```


### Additional Notes
You  tune dns-Corefile to set up DNS server configuration as well as hostapd in configs/gen_hostapd.sh

### Using a different wireless dongle 
For using the built-in wireless or a different dongle, the hostapd configuration may need to be modified in configs/gen_hostapd.sh.
Note that if the built-in wireless is to be used, WPA3 is not currently available without additional broadcom firmware patches. 


## Running:

```
./run_docker_compose.sh
./run_monitor.sh
```

## Adding additional devices

Currently, devices must be added manually as documented above and the superwifid service should be restarted. 

