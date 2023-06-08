FROM ubuntu:22.04 as builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates git curl
RUN mkdir /code
WORKDIR /code
ARG TARGETARCH
RUN curl -O https://dl.google.com/go/go1.20.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.20.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
COPY code/ /code/

WORKDIR /code
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -ldflags "-s -w" -o /api


FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends git hostapd iw jc systemd && rm -rf /var/lib/apt/lists/*
COPY scripts /scripts/
# iw list json parser
RUN mkdir -p /root/.local/share/jc/jcparsers
COPY scripts/iw_*.py /root/.local/share/jc/jcparsers

COPY --from=builder /api /
ENTRYPOINT ["/scripts/startup.sh"]
