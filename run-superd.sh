#!/bin/bash
set -a
. /spr-environment.sh 
cd superd
docker build . -t supernetworks.org/superd
docker cp $(docker create --rm supernetworks.org/superd):/superd ./superd
cd ..
./superd/superd &


