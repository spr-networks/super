FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat-traditional inetutils-ping net-tools nano ca-certificates git curl wget
RUN update-ca-certificates
RUN mkdir /code
WORKDIR /code

ARG TARGETARCH
RUN wget https://dl.google.com/go/go1.24.2.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.24.2.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"

# Use a ram disk for golang src
ARG COREDNS_VER=unknown
ARG PLUGINS_VER=unknown
ARG CACHEBUST=1
RUN git clone --depth 1 --branch v1.12.2 https://github.com/coredns/coredns.git
WORKDIR /code/coredns/

ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
   [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
   go generate && \
   go get github.com/spr-networks/coredns-jsonlog && \
   go get github.com/spr-networks/coredns-block && \
   go get github.com/spr-networks/coredns-spr_cache && \
   go get github.com/spr-networks/coredns-spr_forward && \
   sed -i 's/metadata:metadata/metadata:metadata\njsonlog:github.com\/spr-networks\/coredns-jsonlog/g' plugin.cfg && \
   sed -i 's/etcd:etcd/etcd:etcd\nrebinding_protection:github.com\/spr-networks\/coredns-rebinding_protection/g' plugin.cfg && \
   sed -i 's/hosts:hosts//g' plugin.cfg && \
   sed -i 's/cache:cache/hosts:hosts\nblock:github.com\/spr-networks\/coredns-block\ncache:github.com\/spr-networks\/coredns-spr_cache/g' plugin.cfg && \
   sed -i 's/forward:forward/forward:github.com\/spr-networks\/coredns-spr_forward/g' plugin.cfg && \
   sed -i 's/on:github.com\/coredns\/caddy\/onevent//g' plugin.cfg && \
   go generate && \
   go mod tidy && \
   go build -o /coredns

FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
COPY --from=builder /coredns /
COPY scripts/ /scripts
ENTRYPOINT ["/scripts/startup.sh"]
