# A Secure Programmable Router

[![release version](https://img.shields.io/github/v/release/spr-networks/super)](https://github.com/spr-networks/super/releases/latest)
![version](https://img.shields.io/github/v/tag/spr-networks/super?sort=semver&label=version)
![docker build](https://github.com/spr-networks/super/actions/workflows/docker-image.yml/badge.svg?branch=main)
![iso build](https://github.com/spr-networks/super/actions/workflows/pi-ubuntu-iso.yml/badge.svg?branch=main)
![license](https://img.shields.io/github/license/spr-networks/super)

## Overview

Create an adaptive, micro-segmented network for managing WiFi devices, remote VPN access, and wired devices.

Firewall rules dynamically enforce Policy for fine-grained device connectivity and internet access. 

## How it Works

An unspoofable device identity is established with MAC & Per-Device PSK for WiFi (or a VPN Public Key for Remote Devices). From there, each device gets its own /30 subnet to exist on. Hardening and firewall blocks network attacks -- and routing rules redefine connectivity between devices and to the internet.

## Features

Security
- Multi-PSK including with WPA3, a SPR first
- Secure Router Chaining
- Almost no unmanaged code, minimized attack surfaces

Firewall:
- One-way connectivity to service resources
- Device Groups & Isolation
- Port Forwarding
- Scheduling, Event-Based Triggers *
- DNAT Rewriting * 
  
WiFi 
- WPA3/2
- WPA1 backwards compatibility
- WiFi 6 SUPPORT

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

* Some features are part of SPR PLUS, a paid subscription to support the project

## Our Goals
1. Be the best Security & Privacy choice
2. Programmable with an API 
3. Easy to use 

## Frequently Asked Questions
Check out our [FAQ](https://www.supernetworks.org/pages/docs/faq) on our website

## Why SPR Over Alternatives

SPR is built to support an adapative, microsegmented network that unifies WiFi, DNS, Routing, and Policy. It's not easy to bolt on the concepts onto exising router stacks -- while also achieving high assurance security that blocks network spoofing attacks and other network flaws. 

## UI Demo Page

https://demo.supernetworks.org/

## Updating 
#### Building from scratch
```bash
./build_docker_compose.sh
docker-compose up -d
```

For performance and to minimize wear on SD cards, the build uses a memory-backed filesystem. On memory-limited devices, this can cause build failures if memory is exhausted. In this case, you can provide the build argument `--set "*.args.USE_TMPFS=false"`.


#### Using prebuilt containers
```bash
docker-compose pull
docker-compose up -d
```

## Useful Links

* Our website: https://www.supnetworks.org/
* API Docs https://www.supernetworks.org/pages/api/0
* Documentation Home: https://www.supernetworks.org/pages/docs/intro/
* Raspberry Pi 4 Setup https://www.supernetworks.org/pages/docs/pi4b
* General Setup Guide https://www.supernetworks.org/pages/docs/setup_run_spr
* FAQ https://www.supernetworks.org/pages/docs/faq
* Get the iOS App https://apps.apple.com/us/app/secure-programmable-router/id6443709201
* Join the Discord chat https://discord.gg/EUjTKJPPAX




