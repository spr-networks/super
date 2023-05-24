# Run tests

## Running

```sh
export API_URL="http://192.168.2.1" # default
export TOKEN=SPR-API-TOKEN
# or
#export API_URL="http://127.0.0.1:8000"
#export AUTH="admin:admin" # default

yarn test
yarn test:plus
```

# Build

```sh
yarn install
```

## Install recent node version on host

```
apt-get update && apt-get install -y \
    software-properties-common \
    npm
npm install n -g && \
    n latest
```

## Or use a Dockerfile for `sta_test`:

**TODO**

Same as sta1/

```yaml
FROM ubuntu:22.04

RUN apt-get update && apt-get -y install iproute2 wireless-tools iw nano tcpdump inetutils-ping netcat wpasupplicant curl hostapd isc-dhcp-client

RUN apt-get update && apt-get install -y \
    software-properties-common \
    npm
RUN npm install n -g && \
    n latest

COPY w.conf /w.conf
COPY go.sh /
ENTRYPOINT ["/go.sh"]
```

## TODO

run this code either on host or in a docker container similar to sta1,2,3
