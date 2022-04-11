FROM ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y iptables nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates curl
COPY scripts /scripts

ENTRYPOINT /scripts/startup.sh
