FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates curl
RUN apt-get install -y --no-install-recommends iptables conntrack isc-dhcp-client
COPY scripts /scripts
RUN rm -rf /var/lib/apt/lists/*
ENTRYPOINT /scripts/startup.sh
