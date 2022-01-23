#!/bin/bash
./frontend/gen_frontend.sh
docker-compose -f docker-image-prebuilt.yml up -d

