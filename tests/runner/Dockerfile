FROM ubuntu:23.10

RUN apt-get update && apt-get -y install iproute2 wireless-tools iw nano tcpdump inetutils-ping netcat.traditional wpasupplicant curl hostapd isc-dhcp-client

RUN apt-get update && apt-get install -y \
    software-properties-common \
    npm

RUN npm install n -g && \
    n latest

COPY code /code
WORKDIR /code
RUN npm install

COPY go.sh /
ENTRYPOINT ["/go.sh"]
