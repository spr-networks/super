# A Secure Programmable Router

## Introduction

This project creates a hardened router setup for connecting IOT devices or running an entire home network. 
By employing per-station passphrases and strict firewall rules, a hardened network is created.
The project enables a high degree of confidence about where packets come from and where they can actually go,
with protections against MAC cloaking/spoofing and fine grained access controls. 

## Goals
1. Security & Privacy
2. Programmable with an API 
3. Easy to use 

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

* Join the Discord chat https://discord.gg/EUjTKJPPAX
* API Docs https://www.supernetworks.org/pages/api/0
* Documentation Home: https://www.supernetworks.org/pages/docs/intro/
* Raspberry Pi 4 Setup https://www.supernetworks.org/pages/docs/pi4b
* General Setup Guide https://www.supernetworks.org/pages/docs/setup_run_spr

