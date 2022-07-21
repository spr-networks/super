#!/bin/bash
cp -R base/template_configs/ configs/
mv configs/base/virtual-config.sh configs/base/config.sh
./superd.sh &
docker-compose -f docker-compose-virt.yml up -d

