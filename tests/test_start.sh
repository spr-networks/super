#!/bin/bash

export RELEASE_CHANNEL=-dev

docker build tests/sta1 -t sta1

# tbd copy test configs over

docker-compose -f docker-compose-test.yml up -d

# start stations
docker run --privileged --rm -d --name sta1 sta1
docker run --privileged --rm -d --name sta2 sta1
#docker run --privileged --rm -d --name sta3 sta1
#docker run --privileged --rm -d --name sta4 sta1

./tests/hwsim_setup.sh
