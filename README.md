# 📡 SPR: Open Source, secure, user friendly and fast wifi routers for your home. 

[![release version](https://img.shields.io/github/v/release/spr-networks/super)](https://github.com/spr-networks/super/releases/latest)
![version](https://img.shields.io/github/v/tag/spr-networks/super?sort=semver&label=version)
![docker build](https://github.com/spr-networks/super/actions/workflows/docker-image.yml/badge.svg?branch=main)
![iso build](https://github.com/spr-networks/super/actions/workflows/pi-ubuntu-iso.yml/badge.svg?branch=main)
![license](https://img.shields.io/github/license/spr-networks/super)

## Overview

Create an adaptive, micro-segmented network for managing WiFi devices, remote VPN access, and wired systems.

* One Password Per WiFi Device
* Policy Based / Zero Trust Network Access
* Per-Device DNS Rules & Ad Block Lists

<img width="1218" alt="image" src="https://github.com/spr-networks/super/assets/37549748/c0ebf4fe-0a29-4087-a039-53968c87a00b">

## Get Involved 

💬 Have questions? Join the conversation in our [Discussions](https://github.com/spr-networks/super/discussions) page.
* [Join the Discord chat](https://discord.gg/EUjTKJPPAX)
* [Stay in the loop](https://sendfox.com/supernetworks) with our newsletter

## How it Works

An unspoofable device identity is established with a MAC address and Per-Device Passphrase for WiFi (or a VPN Public Key for Remote Devices). From there, each device gets its own /30 subnet to exist on. Hardening and strict firewall rules block network spoofing and impersonation, and routing rules redefine connectivity between devices and to the internet.

## Features

Security
- Multi-PSK including with WPA3, a SPR first
- Secure Router Chaining
- Almost no unmanaged code, minimized attack surfaces

Firewall:
- One-way connectivity to service resources
- Device Groups & Isolation
- Port Forwarding
- Custom Interface rules for integrations 
- Scheduling, Event-Based Triggers *
- DNAT Rewriting * 
  
WiFi 
- WPA3/2
- WPA1 backwards compatibility
- WiFi 6 Support

Advanced Networking
- Wireguard™ VPN
- Multi WAN with Load Balancing
- Wireless Uplink
- Multicast Traffic Support
- Mesh with Wired Backhaul *
- Policy Based Site Forwarding  *

Advanced DNS Capabilities
- Remote DNS Queries with DNS over HTTPs 
- DNS Ad Block lists
- Per-Device DNS Rules and Overrides

User Friendly
- React UX
- iOS App Available * 

Observability
- IP Traffic
- DNS Logs
- Event System & DB
- API  

Interoperability:
- Runs on a wide variety of Linux systems with Docker
- API Plugin System 

&ast; Some features are part of SPR PLUS, a paid subscription to support the project

## Our Goals
1. Be the best Security & Privacy choice
2. Programmable with an API 
3. Easy to use 

## Frequently Asked Questions
Check out our [FAQ](https://www.supernetworks.org/pages/docs/faq) on our website

## Why SPR Over Alternatives

SPR is built to support an adapative, microsegmented network that unifies WiFi, DNS, Routing, and Policy. It's not easy to bolt on the concepts onto exising router stacks while also achieving high assurance security that blocks network spoofing attacks and other network flaws. 

## UI Demo Page

https://demo.supernetworks.org/

## SPR Bus Events

https://github.com/spr-networks/sprbus

![image](https://user-images.githubusercontent.com/37542945/232639810-7e17380c-42ea-480b-811e-cf5add04a0d2.gif)

## Updating 
#### Building from scratch
```bash
./build_docker_compose.sh --load
docker-compose up -d
```

For performance and to minimize wear on SD cards, the build uses a memory-backed filesystem. On memory-limited devices, this can cause build failures if memory is exhausted. In this case, you can provide the build argument `--set "*.args.USE_TMPFS=false"`.


#### Using prebuilt containers
```bash
docker-compose pull
./setup.sh # (optional)
docker-compose up -d
```

## Useful Links

* [supernetworks.org](https://www.supernetworks.org/)
* [API Docs](https://www.supernetworks.org/pages/api/0)
* [Documentation Home](https://www.supernetworks.org/pages/docs/intro)
* [Raspberry Pi 4 Setup Guide](https://www.supernetworks.org/pages/docs/setup_guides/pi4b)
* [General Setup Guide](https://www.supernetworks.org/pages/docs/setup_guides/setup_run_spr)
* [Virtual Setup Guide (Personal VPN)](https://www.supernetworks.org/pages/docs/setup_guides/virtual_spr)

* [FAQ](https://www.supernetworks.org/pages/docs/faq)
* [Get the iOS App](https://apps.apple.com/us/app/secure-programmable-router/id6443709201)



