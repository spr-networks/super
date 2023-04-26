#!/bin/bash
docker-compose -f docker-compose-test.yml stop
docker kill sta{1,2,3}
