FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat-traditional inetutils-ping net-tools nano ca-certificates git curl wget
RUN apt-get install -y --no-install-recommends clang lld
RUN apt-get install -y --no-install-recommends pkg-config gcc llvm m4 emacs libpcap-dev libelf-dev make libnl-route-3-dev libnl-genl-3-dev libssl-dev
RUN mkdir /code
WORKDIR /code
RUN git clone -b v1.2.0 --depth 1 https://github.com/xdp-project/xdp-tools.git
WORKDIR /code/xdp-tools
RUN ./configure
RUN ln -s /usr/include/`uname -m`-linux-gnu/asm /usr/include/asm
RUN make -j $(( $(nproc) / 4 ))
COPY code/filter_dhcp_mismatch.c /code/
WORKDIR /code
RUN clang -O3 -target bpf -D __BPF_TRACING__ -I xdp-tools/headers/ -I xdp-tools/lib/libbpf/src/root/usr/include/ -c filter_dhcp_mismatch.c

ARG TARGETARCH
RUN wget https://dl.google.com/go/go1.24.2.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.24.2.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
COPY code/main.go /code/
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -ldflags="-s -w" -o /hostap_dhcp_helper main.go

# Build hostapd
ARG CACHEBUST=1
RUN git clone https://github.com/spr-networks/hostap --depth 1
COPY code/hostapd_config /code/hostap/hostapd/.config

WORKDIR /code/hostap/hostapd
RUN mkdir /usr/lib/llvm-18/lib/clang/18/share/
RUN touch /usr/lib/llvm-18/lib/clang/18/share/cfi_ignorelist.txt
RUN touch ignorelist.txt
RUN LDFLAGS="-flto" CC=clang LD=lld EXTRA_CFLAGS="-fsanitize=cfi -fsanitize-ignorelist=ignorelist.txt  -flto -fstack-clash-protection -fstack-protector-strong -Werror=format-security -D_GLIBCXX_ASSERTIONS -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=3 -fvisibility=default" make -j $(( $(nproc) / 4 ))
RUN make install

FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends libnl-genl-3-dev libnl-route-3-dev iw lshw && rm -rf /var/lib/apt/lists/*
COPY --from=builder /code/hostap/hostapd/hostapd /usr/local/bin/
COPY --from=builder /code/hostap/hostapd/hostapd_cli /usr/local/bin/
COPY --from=builder /hostap_dhcp_helper /
RUN mkdir /code/
COPY --from=builder /code/filter_dhcp_mismatch.o /code/
COPY scripts /scripts
ENTRYPOINT ["/scripts/startup.sh"]
