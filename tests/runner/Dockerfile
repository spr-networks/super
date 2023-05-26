FROM ubuntu:22.04

RUN apt-get update && apt-get -y install iproute2 wireless-tools iw nano tcpdump inetutils-ping netcat wpasupplicant curl hostapd isc-dhcp-client

RUN apt-get update && apt-get install -y \
    software-properties-common \
    npm

RUN npm install n -g && \
    n latest

COPY go.sh /
ENTRYPOINT ["/go.sh"]
