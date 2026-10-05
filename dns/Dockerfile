# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# check=skip=InvalidDefaultArgInFrom
ARG ALPINE_REF=alpine@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
ARG UBUNTU_REF=ubuntu:24.04@sha256:008173c23f95b170204355c12626cb5a965d779a7e1283b09e9cffbb1bf33ca3
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:ef770c9ac3f064ca532b06882d3d6bbd6dbe8632f6704077bb1113b9b9c4996e
ARG SOURCE_DATE_EPOCH

FROM ${ALPINE_REF} AS cacerts

FROM ${UBUNTU_REF} AS builder
ENV DEBIAN_FRONTEND=noninteractive
ARG UBUNTU_SNAPSHOT=20260930T000000Z
ARG GO_VERSION=1.26.8
ARG GO_SHA256_AMD64=d0f743b33e8d8945e6b1f432edd15785c70507121d6e2a723b21285eddf8b57b
ARG GO_SHA256_ARM64=211ffced9dcb9633a55eac6364816ec0ddd951389a740e88fa8b3337971bdda0
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
ARG COREDNS_BLOCK_COMMIT=7f2369fce082507b1e908e802407d3093669c35a
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
