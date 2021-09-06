# A Secure Programmable Router

## Introduction

This project creates a hardened router setup for connecting IOT devices. 
By employing per-station passphrases and strict firewall rules, a hardened network is created.
There project enables a high degree of confidence about where packets come from and where they can actually go.


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

