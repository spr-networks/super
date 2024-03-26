FROM ubuntu:23.10

RUN apt-get update && apt-get -y install iproute2 wireless-tools iw nano tcpdump inetutils-ping netcat.traditional wpasupplicant curl hostapd isc-dhcp-client

COPY w.conf /w.conf
COPY sta3.conf /sta3.conf
COPY go.sh /
COPY sta3.sh /
COPY sta4.sh /
COPY sta4.conf /

ENTRYPOINT ["/go.sh"]
