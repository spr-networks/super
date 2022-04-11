FROM ubuntu:21.04 as builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates git curl clang
RUN mkdir /code
WORKDIR /code

ARG TARGETARCH
RUN curl -O https://dl.google.com/go/go1.17.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"


ENV CC=clang

# Use a ram disk for golang src
ARG COREDNS_VER=unknown
ARG PLUGINS_VER=unknown
ENV GOPRIVATE=github.com/spr-networks/*
ARG CACHEBUST=1
RUN git clone https://github.com/coredns/coredns.git --depth 1
WORKDIR /code/coredns/

# Using BUILDKIT, build inside of a ramfs
RUN --mount=type=tmpfs,target=/root/go/ go generate && \
   go get github.com/spr-networks/coredns-jsonlog && \
   go get github.com/spr-networks/coredns-block && \
   go get github.com/spr-networks/coredns-rebinding_protection && \
   sed -i 's/metadata:metadata/metadata:metadata\njsonlog:github.com\/spr-networks\/coredns-jsonlog/g' plugin.cfg && \
   sed -i 's/etcd:etcd/etcd:etcd\nblock:github.com\/spr-networks\/coredns-block\nrebinding_protection:github.com\/spr-networks\/coredns-rebinding_protection/g' plugin.cfg && \
   go generate && \
   go mod tidy && \
   go build -o /coredns

FROM ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates
COPY --from=builder /coredns /
ENTRYPOINT /coredns -conf /configs/dns/Corefile
