#!/bin/bash

export RELEASE_CHANNEL=-dev

docker build tests/sta1 -t sta1

# Reset testing config
rm -rf configs
cp -R tests/test_configs configs

docker compose -f docker-compose-test.yml up -d



# start stations -- no docker network, they must rely on hwsim
docker run --network none --privileged --rm -d --name sta1 sta1
docker run --network none --privileged --rm -d --name sta2 sta1
docker run --network none --privileged --rm -d --entrypoint=/sta3.sh --name sta3 sta1
docker run --network none --privileged --rm -d --entrypoint=/sta4.sh --name sta4 sta1

./tests/hwsim_setup.sh

if [ -n "$RUNTEST" ]; then
  ./tests/run-tests.sh
fi
