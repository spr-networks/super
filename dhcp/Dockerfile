FROM ubuntu:22.04 as builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates git curl
RUN apt-get install -y --no-install-recommends clang
RUN mkdir /code
WORKDIR /code

ARG TARGETARCH
RUN curl -O https://dl.google.com/go/go1.17.linux-$TARGETARCH.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-$TARGETARCH.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"

# Build CoreDHCP
ENV CC=clang
ARG CACHEBUST=1
RUN git clone https://github.com/spr-networks/coredhcp
WORKDIR /code/coredhcp
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -o /coredhcpd ./cmds/coredhcp && \
    go build -o /coredhcp_client ./cmds/exdhcp/dhclient/


FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends ethtool isc-dhcp-client && rm -rf /var/lib/apt/lists/*
COPY --from=builder /coredhcpd /
COPY --from=builder /coredhcp_client /
COPY scripts /scripts

ENTRYPOINT ["/scripts/startup.sh"]
