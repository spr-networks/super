FROM --platform=linux/arm64 ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y nftables iproute2 netcat inetutils-ping
RUN apt-get install -y net-tools
RUN apt-get install -y nano
RUN apt-get install -y ca-certificates

RUN apt-get install -y git
RUN mkdir /code
WORKDIR /code

RUN apt-get install -y curl
RUN curl -O https://dl.google.com/go/go1.17.linux-arm64.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-arm64.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"

RUN apt-get install -y clang

ENV CC=clang
ARG GITHUB_CREDS=git@github.com
ENV ENV_GITHUB_CREDS=$GITHUB_CREDS
RUN git config --global url."https://${ENV_GITHUB_CREDS}".insteadOf "https://github.com"

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

ENTRYPOINT /coredns -conf /configs/dns/Corefile
