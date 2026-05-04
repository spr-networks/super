FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates git wget && \
    rm -rf /var/lib/apt/lists/*
RUN mkdir /code
WORKDIR /code

ARG TARGETARCH
RUN wget https://dl.google.com/go/go1.24.2.linux-${TARGETARCH}.tar.gz && \
    rm -rf /usr/local/go && tar -C /usr/local -xzf go1.24.2.linux-${TARGETARCH}.tar.gz && \
    rm go1.24.2.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"

ARG COREDNS_VER=unknown
ARG PLUGINS_VER=unknown
ARG CACHEBUST=1
RUN git clone --depth 1 --branch v1.14.3 https://github.com/coredns/coredns.git
WORKDIR /code/coredns/

# Use minimal plugin.cfg — only plugins SPR actually needs
COPY plugin.cfg .

ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
   [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
   go generate && \
   go get github.com/spr-networks/coredns-jsonlog && \
   go get github.com/spr-networks/coredns-block && \
   go get github.com/spr-networks/coredns-spr_cache && \
   go get github.com/spr-networks/coredns-spr_forward && \
   go generate && \
   go mod tidy && \
   CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /coredns

FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
COPY --from=builder /coredns /
COPY scripts/ /scripts
ENTRYPOINT ["/scripts/startup.sh"]
