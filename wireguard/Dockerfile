FROM --platform=linux/arm64 ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y iptables nftables iproute2 netcat inetutils-ping
RUN apt-get install -y net-tools
RUN apt-get install -y nano
RUN apt-get install -y ca-certificates
RUN apt-get install -y --no-install-recommends wireguard-tools
COPY scripts /scripts
COPY configs /configs
ENTRYPOINT /scripts/startup.sh
