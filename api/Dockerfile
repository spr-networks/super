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
RUN apt-get install -y hostapd

ENV CC=clang
RUN go mod init api
RUN go get github.com/gorilla/mux
COPY code/api.go /code/
RUN go build -o /api /code/api.go

COPY scripts /scripts/

ENTRYPOINT ["/scripts/startup.sh"]

