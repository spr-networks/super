FROM --platform=linux/arm ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get dist-upgrade -y
RUN apt-get install -y nftables iproute2 netcat inetutils-ping
RUN apt-get install -y net-tools
RUN apt-get install -y nano
RUN apt-get install -y ca-certificates

RUN apt-get install -y git
RUN mkdir /code
WORKDIR /code

RUN apt-get install -y curl
RUN curl -O https://dl.google.com/go/go1.17.linux-armv6l.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-armv6l.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"

RUN apt-get install -y clang

ENV CC=clang
RUN go mod init multicastproxy
RUN go get golang.org/x/net/ipv4@latest
RUN go get github.com/vishvananda/netlink@latest
COPY code/multicastproxy.go /code/
RUN go build multicastproxy.go

COPY scripts /scripts/

ENTRYPOINT ["/scripts/startup.sh"]

