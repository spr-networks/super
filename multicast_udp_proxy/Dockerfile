FROM --platform=linux/arm64 ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates git curl clang
RUN mkdir /code
WORKDIR /code

RUN curl -O https://dl.google.com/go/go1.17.linux-arm64.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-arm64.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"

ENV CC=clang
RUN go mod init multicastproxy
RUN go get golang.org/x/net/ipv4@latest
RUN go get github.com/vishvananda/netlink@latest
COPY code/multicastproxy.go /code/
RUN go build multicastproxy.go

COPY scripts /scripts/

ENTRYPOINT ["/scripts/startup.sh"]

