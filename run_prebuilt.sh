#!/bin/bash
./pull_containers.sh
docker-compose -f docker-compose-prebuilt.yml up -d

