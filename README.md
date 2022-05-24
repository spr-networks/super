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
docker-compose pull
./build.sh
docker-compose up -d
```

#### Using prebuilt containers
```bash
docker-compose -f docker-compose-prebuilt.yml pull
docker-compose -f docker-compose-prebuilt.yml up -d
```

## Useful Links

* Join the Discord chat https://discord.gg/WeNKMVTR
* API Docs https://www.supernetworks.org/pages/api/0
* Documentation Home: https://www.supernetworks.org/pages/docs/intro/
* Raspberry Pi 4 Setup https://www.supernetworks.org/pages/docs/pi4b
* General Setup Guide https://www.supernetworks.org/pages/docs/setup_run_spr

