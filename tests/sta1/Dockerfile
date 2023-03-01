FROM ubuntu:22.04

RUN apt-get update && apt-get -y install iproute2 wireless-tools iw nano tcpdump inetutils-ping netcat wpasupplicant curl hostapd isc-dhclient

COPY w.conf /w.conf
COPY go.sh /
ENTRYPOINT ["/go.sh"]
