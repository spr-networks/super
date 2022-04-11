FROM ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates && \
    apt-get install -y --no-install-recommends wireguard-tools
COPY scripts /scripts
ENTRYPOINT /scripts/startup.sh
