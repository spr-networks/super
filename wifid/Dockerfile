# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:295e44462ab12776c716e28a64dc5a00131576d606e7db6189af2f7869b9bb4e
ARG SOURCE_DATE_EPOCH

FROM gobuilder AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      clang lld pkg-config gcc llvm m4 libpcap-dev libelf-dev make \
      libnl-route-3-dev libnl-genl-3-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache

ARG XDP_TOOLS_COMMIT=d0be4a03840d13954ea75b0b9901f90510b790d2
RUN git init xdp-tools \
 && git -C xdp-tools remote add origin https://github.com/xdp-project/xdp-tools.git \
 && git -C xdp-tools fetch --depth 1 origin "${XDP_TOOLS_COMMIT}" \
 && git -C xdp-tools checkout --detach FETCH_HEAD
WORKDIR /code/xdp-tools
RUN ./configure
RUN ln -s /usr/include/`uname -m`-linux-gnu/asm /usr/include/asm
RUN make -j $(( $(nproc) / 4 ))
COPY code/filter_dhcp_mismatch.c /code/
WORKDIR /code
RUN clang -O3 -target bpf -D __BPF_TRACING__ -I xdp-tools/headers/ -I xdp-tools/lib/libbpf/src/root/usr/include/ -c filter_dhcp_mismatch.c

COPY code/main.go /code/
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -trimpath -ldflags="-s -w" -o /hostap_dhcp_helper main.go

# Build hostapd
ARG HOSTAP_COMMIT=44388da18334224b1363799838f9882ade25de37
RUN git init hostap \
 && git -C hostap remote add origin https://github.com/spr-networks/hostap \
 && git -C hostap fetch --depth 1 origin "${HOSTAP_COMMIT}" \
 && git -C hostap checkout --detach FETCH_HEAD
COPY code/hostapd_config /code/hostap/hostapd/.config

WORKDIR /code/hostap/hostapd
RUN mkdir /usr/lib/llvm-18/lib/clang/18/share/
RUN touch /usr/lib/llvm-18/lib/clang/18/share/cfi_ignorelist.txt
RUN touch ignorelist.txt
RUN LDFLAGS="-flto" CC=clang LD=lld EXTRA_CFLAGS="-fsanitize=cfi -fsanitize-ignorelist=ignorelist.txt  -flto -fstack-clash-protection -fstack-protector-strong -Werror=format-security -D_GLIBCXX_ASSERTIONS -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=3 -fvisibility=default" make -j $(( $(nproc) / 4 ))
RUN make install

FROM ${CONTAINER_TEMPLATE_REF}
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends libnl-genl-3-dev libnl-route-3-dev iw lshw && rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache
COPY --from=builder /code/hostap/hostapd/hostapd /usr/local/bin/
COPY --from=builder /code/hostap/hostapd/hostapd_cli /usr/local/bin/
COPY --from=builder /hostap_dhcp_helper /
RUN mkdir /code/
COPY --from=builder /code/filter_dhcp_mismatch.o /code/
COPY scripts /scripts
ENTRYPOINT ["/scripts/startup.sh"]
