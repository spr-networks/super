#!/bin/bash
./frontend/gen_frontend.sh
docker-compose -f docker-compose-prebuilt.yml up -d

