FROM ubuntu:22.04 as builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates git curl
RUN apt-get install -y --no-install-recommends clang
RUN mkdir /code
WORKDIR /code

ARG TARGETARCH
RUN curl -O https://dl.google.com/go/go1.19.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.19.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"


ENV CC=clang

# Use a ram disk for golang src
ARG COREDNS_VER=unknown
ARG PLUGINS_VER=unknown
ENV GOPRIVATE=github.com/spr-networks/*
ARG CACHEBUST=1
RUN git clone https://github.com/coredns/coredns.git --depth 1
WORKDIR /code/coredns/

ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
   [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
   go generate && \
   go get github.com/spr-networks/coredns-jsonlog && \
   go get github.com/spr-networks/coredns-block && \
   go get github.com/spr-networks/coredns-rebinding_protection && \
   sed -i 's/metadata:metadata/metadata:metadata\njsonlog:github.com\/spr-networks\/coredns-jsonlog/g' plugin.cfg && \
   sed -i 's/etcd:etcd/etcd:etcd\nblock:github.com\/spr-networks\/coredns-block\nrebinding_protection:github.com\/spr-networks\/coredns-rebinding_protection/g' plugin.cfg && \
   go generate && \
   go mod tidy -compat=1.19 && \
   go build -o /coredns

FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
COPY --from=builder /coredns /
COPY scripts/ /scripts
ENTRYPOINT /scripts/startup.sh
