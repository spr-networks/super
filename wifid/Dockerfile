# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
# check=skip=InvalidDefaultArgInFrom
ARG ALPINE_REF=alpine@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
ARG UBUNTU_REF=ubuntu:24.04@sha256:4fbb8e6a8395de5a7550b33509421a2bafbc0aab6c06ba2cef9ebffbc7092d90
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:869ada7b121e9a0c552674042d32e801da3c4d04145638d9e722918c6377e65f
ARG SOURCE_DATE_EPOCH

FROM ${ALPINE_REF} AS cacerts

FROM ${UBUNTU_REF} AS builder
ENV DEBIAN_FRONTEND=noninteractive
ARG UBUNTU_SNAPSHOT=20260701T000000Z
ARG GO_VERSION=1.25.12
ARG GO_SHA256_AMD64=234828b7a89e0e303d2556310ee549fbcf253d28de937bac3da13d6294262ac1
ARG GO_SHA256_ARM64=8b5884aef89600aef5b0b051fb971f11f49bb996521e911f30f02a66884f7bd2
ARG TARGETARCH
COPY --from=cacerts /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN set -eux; \
    printf 'Types: deb\nURIs: https://snapshot.ubuntu.com/ubuntu/%s\nSuites: noble noble-updates noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list.d/ubuntu.sources; \
    printf 'APT::Install-Recommends "false";\nAcquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99reproducible
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git wget && rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache
RUN set -eux; \
    case "${TARGETARCH}" in \
      amd64) GO_SHA256="${GO_SHA256_AMD64}";; \
      arm64) GO_SHA256="${GO_SHA256_ARM64}";; \
      *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1;; \
    esac; \
    wget -q "https://dl.google.com/go/go${GO_VERSION}.linux-${TARGETARCH}.tar.gz"; \
    echo "${GO_SHA256}  go${GO_VERSION}.linux-${TARGETARCH}.tar.gz" | sha256sum -c -; \
    tar -C /usr/local -xzf "go${GO_VERSION}.linux-${TARGETARCH}.tar.gz"; \
    rm "go${GO_VERSION}.linux-${TARGETARCH}.tar.gz"
ENV PATH="/usr/local/go/bin:${PATH}" GOTOOLCHAIN=local
WORKDIR /code
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

COPY code/go.mod code/main.go code/control.go code/roaming.go /code/
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -trimpath -ldflags="-s -w" -o /hostap_dhcp_helper main.go control.go roaming.go

# Build hostapd
ARG HOSTAP_COMMIT=596ffafdda209026c4cfe5e5f0367fce745991d7
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
ARG UBUNTU_SNAPSHOT=20260701T000000Z
RUN set -eux; \
    printf 'Types: deb\nURIs: https://snapshot.ubuntu.com/ubuntu/%s\nSuites: noble noble-updates noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list.d/ubuntu.sources; \
    printf 'APT::Install-Recommends "false";\nAcquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99reproducible
RUN apt-get update && apt-get install -y --no-install-recommends libnl-genl-3-dev libnl-route-3-dev iw lshw && rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache
COPY --from=builder /code/hostap/hostapd/hostapd /usr/local/bin/
COPY --from=builder /code/hostap/hostapd/hostapd_cli /usr/local/bin/
COPY --from=builder /hostap_dhcp_helper /
RUN mkdir /code/
COPY --from=builder /code/filter_dhcp_mismatch.o /code/
COPY scripts /scripts
ENTRYPOINT ["/scripts/startup.sh"]
