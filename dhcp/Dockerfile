FROM --platform=linux/arm ubuntu:21.04
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
RUN curl -O https://dl.google.com/go/go1.17.linux-armv6l.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-armv6l.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"

RUN git clone https://github.com/xdp-project/xdp-tools.git
WORKDIR /code/xdp-tools
RUN DEBIAN_FRONTEND="noninteractive" apt-get install -y pkg-config
RUN apt-get install -y gcc clang
RUN apt-get install -y llvm m4 emacs
RUN apt-get install -y libpcap-dev libelf-dev
RUN apt-get install -y make
RUN ./configure

RUN ln -s /usr/include/arm-linux-gnueabihf/asm /usr/include/asm

#fix for libbpf issue
RUN CFLAGS=-D_FILE_OFFSET_BITS=64 make 
COPY code/filter_dhcp_mismatch.c /code/
WORKDIR /code/
RUN clang -O3 -target bpf -D __BPF_TRACING__ -I xdp-tools/headers/ -I xdp-tools/lib/libbpf/src/root/usr/include/ -c filter_dhcp_mismatch.c
WORKDIR /code

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

RUN apt-get install -y netplug
COPY scripts /scripts
COPY configs /configs
COPY scripts/netplug /etc/netplug/netplug
COPY configs/netplugd.conf /etc/netplug/netplugd.conf

ENTRYPOINT ["/scripts/startup.sh"]

