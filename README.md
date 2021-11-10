# A Secure Programmable Router

## Introduction

This project creates a hardened router setup for connecting IOT devices. 
By employing per-station passphrases and strict firewall rules, a hardened network is created.
There project enables a high degree of confidence about where packets come from and where they can actually go.

## The Network Design

Each device on the network is sequestered into a tiny subnet, and all devices must communicate through the router to communicate with one another. 
Groups are used to inform nftable sets about a device's network access, by MAC address and IP address.

The firewall rules are in https://github.com/SPR-FI/super/blob/main/base/scripts/nft_rules.sh

The forwarding and input policies are default drop.

The following ports are exposed to WAN:
- sshd (tcp 22), iperf3 (tcp 5201) # for development
- wireguard (udp 51280)

On LAN the following services are available:
- DHCP tied to the authenticated MAC address over WiFi or all wired LAN devices
- DNS for devices in the dns_access group
- 1900, 5353 multicast repeater to all devices for SSDP and MDNS

Routing to the LAN or WAN only happens for authenticated, approved MAC addresses.

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
$ xzcat ubuntu-21.04-preinstalled-server-arm64+raspi.img.xz | dd of=/dev/rdisk2 bs=$[1024*1024]
```

1.a. Tune the ubuntu config (see base/setup.sh)

```
# On the booted pi (see and run base/setup.sh)
# git clone https://github.com/SPR-FI/super
# cd super
# base/setup.sh
# reboot
```

```
# Contents of base/setup.sh: 
apt-get update
apt-get -y upgrade
apt-get -y install docker.io docker-compose 

touch /etc/cloud/cloud-init.disabled

# get rid of `predictable` interface names to get eth0, eth1, wlan0, wlan1 instead.
mv /lib/udev/rules.d/80-net-setup-link.rules /lib/udev/rules.d/80-net-setup-link.rules.bak
ln -s /dev/null  /lib/udev/rules.d/80-net-setup-link.rules

# Add a bug fix for scatter/gather bugs with USB:
echo "options mt76_usb disable_usb_sg=1" > /etc/modprobe.d/mt76_usb.conf

# do not use systemd-resolvd, we will use our own container later
systemctl disable systemd-resolved
systemctl stop systemd-resolved
rm /etc/resolv.conf
echo "nameserver 1.1.1.1" > /etc/resolv.conf

# constrain journal size
echo -e "[Journal]\n\nSystemMaxUse=50m\nSystemMaxFileSize=10M" > /etc/systemd/journald.conf 
# mount logs as tmpfs
echo -e "tmpfs\t/tmp\ttmpfs\tdefaults,noatime,nosuid,size=100m\t0\t0\ntmpfs\t/var/tmp\ttmpfs\tdefaults,noatime,nosuid,size=100m\t0\t0\ntmpfs\t/var/log\ttmpfs\tdefaults,noatime,nosuid,mode=0755,size=100m\t0\t0\ntmpfs\t/run\ttmpfs\tdefaults,noatime,nosuid,mode=0755,size=10m\t0\t0\ntmpfs\t/var/run\ttmpfs\tdefaults,noatime,nosuid,mode=0755,size=10m\t0\t0\n" >> /etc/fstab

# disable dhclient on the WANIF, since we will run our own dhcp
echo network: {config: disabled} > /etc/cloud/cloud.cfg.d/99-disable-network-config.cfg

# disable iptables for  docker
echo -e "{\n  \"iptables\": false\n}" > /etc/docker/daemon.json
```



### Configuring the project

Inside the super directory, copy base/template_configs to configs/

```bash
cd super 
cp -R base/template_configs configs
```

Then modify configs/base/config.sh to set an SSID_NAME and configure the various options.  

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
All source code can be built on the pi with 

```
./build_docker_compose.sh 
```

Optionally, use our own coredns build for DNS for the router. The container will need to be running
```
echo nameserver 127.0.0.1 > /etc/resolv.conf

```
## Running:

```
./run_docker_compose.sh
./run_monitor.sh
```



## Adding additional devices

Currently, devices must be added manually as documented above and the superwifid service should be restarted. 

The [add_device.sh](https://github.com/SPR-FI/super/blob/main/add_device.sh) helper script can help add new wifi devices to the network



### Additional Notes
Check dns-Corefile to tweak DNS server configuration as well as the hostapd settings in configs/gen_hostapd.sh

### Using a different wireless dongle 
For using the built-in wireless or a different dongle, the hostapd configuration may need to be modified in configs/gen_hostapd.sh.
Note that if the built-in wireless is to be used, WPA3 is not currently available without additional broadcom firmware patches. The next raspberry pi os releases should include these by default. 
