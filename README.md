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

```bash
# To get started, copy base/template_configs to configs/:
$ sudo -s
# cp -R base/template_configs configs
```

Then modify configs/config.sh to set an SSID_NAME and configure any networking specifics 

Next, set some station passwords. For WPA3, copy sae_passwords.sample to sae_passwords and add your devices
For WPA2 passwords (since many devices will not support WPA2 yet), copy wpa2pskfile.sample to wpa2pskfile and set your passwords there.

Lastly, modify configs/zones/ and set which MAC addresses are allowed which level of access
The default zones are:
- \# This is the default, no devices have to be added to be treated as such. No DNS access, no LAN access, no internet
- isolated 
- \# Allows DNS access as well as talking to all LAN devices (wireless and wired LAN)
- lan_only 
- \# Allows internet/WAN forwareding on top of the above
- wan_lan
- \# Allows internet access but no lan access
- wan_only 
- \# Placeholder for future privileged services, Currently equivalent to the above
- wan_lan_admin 

The groups directory can be used to create sets of devices that can communicate amongst themselves if a device does not need full LAN access. 



### Additional Notes
You may want to modify dns-Corefile to set up DNS server configuration as well as hostapd in configs/gen_hostapd.sh

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

