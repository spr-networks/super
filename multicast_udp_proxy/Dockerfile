FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat-traditional inetutils-ping net-tools nano ca-certificates git curl wget
RUN apt-get install -y --no-install-recommends clang
RUN mkdir /code
WORKDIR /code
ARG TARGETARCH
RUN wget https://dl.google.com/go/go1.24.2.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.24.2.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
ENV CC=clang
ARG USE_TMPFS=true
COPY code/ /code/
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -ldflags="-s -w" multicastproxy.go

FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
RUN mkdir /code/
COPY --from=builder /code/multicastproxy /code/
COPY scripts /scripts/

ENTRYPOINT ["/scripts/startup.sh"]
