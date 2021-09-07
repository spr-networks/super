FROM --platform=linux/arm64 ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get dist-upgrade -y
RUN apt-get install -y nftables iproute2 netcat inetutils-ping
RUN apt-get install -y net-tools
RUN apt-get install -y nano
RUN apt-get install -y ca-certificates
RUN apt-get install -y git
RUN apt-get install -y jq
RUN mkdir /code
WORKDIR /code

RUN apt-get install -y curl
RUN curl -O https://dl.google.com/go/go1.17.linux-arm64.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-arm64.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"

# Build CoreDHCP
ENV CC=clang
ARG GITHUB_CREDS=github.com
ENV ENV_GITHUB_CREDS=$GITHUB_CREDS
RUN git config --global url."https://${ENV_GITHUB_CREDS}".insteadOf "https://github.com"
RUN git clone https://github.com/SPR-Fi/coredhcp
WORKDIR /code/coredhcp

# Using BUILDKIT, build inside of a ramfs
RUN --mount=type=tmpfs,target=/root/go/ go build -o /coredhcp ./cmds/coredhcp

WORKDIR /

COPY scripts /scripts
COPY configs /configs

ENTRYPOINT ["/scripts/startup.sh"]

