#!/bin/sh
# Run the superd docker-api differential tests. Needs the host docker socket
# (the tests create a small labeled image/container and remove them).
docker build -f Dockerfile.test -t superd-test .
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock superd-test \
    sh -c "cd /code && go test -vet=off -v"
