FROM --platform=linux/arm64 ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y nftables iproute2 netcat inetutils-ping
RUN apt-get install -y net-tools
RUN apt-get install -y nano
RUN apt-get install -y ca-certificates
RUN apt-get install -y hostapd


RUN apt-get install -y jq git

RUN mkdir /code
WORKDIR /code
RUN git clone https://github.com/xdp-project/xdp-tools.git
WORKDIR /code/xdp-tools
RUN apt-get install -y pkg-config
RUN apt-get install -y gcc clang
RUN apt-get install -y llvm m4 emacs
RUN apt-get install -y libpcap-dev libelf-dev
RUN apt-get install -y make
RUN ./configure
RUN ln -s /usr/include/aarch64-linux-gnu/asm /usr/include/asm
RUN make
COPY code/filter_dhcp_mismatch.c /code/
WORKDIR /code
RUN clang -O3 -target bpf -D __BPF_TRACING__ -I xdp-tools/headers/ -I xdp-tools/lib/libbpf/src/root/usr/include/ -c filter_dhcp_mismatch.c

RUN apt-get install -y curl
RUN curl -O https://dl.google.com/go/go1.17.linux-arm64.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-arm64.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
COPY code/main.go /code/
RUN go build -o /hostap_dhcp_helper main.go

COPY scripts /scripts
COPY configs /configs
ENTRYPOINT /scripts/startup.sh
