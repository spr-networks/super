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
ARG COREDNS_COMMIT=17fceec6d93fd1dde5ba6888c363f131ff6d647f
RUN git init coredns \
 && git -C coredns remote add origin https://github.com/coredns/coredns.git \
 && git -C coredns fetch --depth 1 origin "${COREDNS_COMMIT}" \
 && git -C coredns checkout --detach FETCH_HEAD
WORKDIR /code/coredns/

# Use minimal plugin.cfg — only plugins SPR actually needs
COPY plugin.cfg .

# SPR CoreDNS plugins, pinned to commits
ARG COREDNS_JSONLOG_COMMIT=5f94aa7d00b823e58f3bc6ace3e03efc26886afa
ARG COREDNS_BLOCK_COMMIT=8b2a08eb180013f1d22d266ed80149f442fd06fe
ARG COREDNS_SPR_CACHE_COMMIT=8f24c9bf05f18e5ed248da4df92c8087f161dbf1
ARG COREDNS_SPR_FORWARD_COMMIT=05d8f874e165b3f940679fde53b0adf62384d00a
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
   [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
   go generate && \
   go get github.com/spr-networks/coredns-jsonlog@${COREDNS_JSONLOG_COMMIT} && \
   go get github.com/spr-networks/coredns-block@${COREDNS_BLOCK_COMMIT} && \
   go get github.com/spr-networks/coredns-spr_cache@${COREDNS_SPR_CACHE_COMMIT} && \
   go get github.com/spr-networks/coredns-spr_forward@${COREDNS_SPR_FORWARD_COMMIT} && \
   go generate && \
   go mod tidy && \
   CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /coredns

FROM ${CONTAINER_TEMPLATE_REF}
ENV DEBIAN_FRONTEND=noninteractive
COPY --from=builder /coredns /
COPY scripts/ /scripts
ENTRYPOINT ["/scripts/startup.sh"]
