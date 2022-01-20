FROM --platform=linux/arm64 ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates
RUN apt-get install -y --no-install-recommends wireguard-tools
COPY scripts /scripts
ENTRYPOINT /scripts/startup.sh
