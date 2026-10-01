# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# check=skip=InvalidDefaultArgInFrom
ARG ALPINE_REF=alpine@sha256:294b683cb724975bec92580e1e685676bd4b50bda910ddb8c51d4cabeaec77e6
ARG UBUNTU_REF=ubuntu:24.04@sha256:008173c23f95b170204355c12626cb5a965d779a7e1283b09e9cffbb1bf33ca3
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:ef770c9ac3f064ca532b06882d3d6bbd6dbe8632f6704077bb1113b9b9c4996e
ARG SOURCE_DATE_EPOCH

FROM ${ALPINE_REF} AS cacerts

FROM ${UBUNTU_REF} AS xdp-builder
ENV DEBIAN_FRONTEND=noninteractive
ARG UBUNTU_SNAPSHOT=20260930T000000Z
COPY --from=cacerts /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN set -eux; \
    printf 'Types: deb\nURIs: https://snapshot.ubuntu.com/ubuntu/%s\nSuites: noble noble-updates noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list.d/ubuntu.sources; \
    printf 'APT::Install-Recommends "false";\nAcquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99reproducible
RUN apt-get update && apt-get install -y --no-install-recommends clang gcc libbpf-dev llvm && rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache
COPY wifid/code/filter_dhcp_mismatch.c /xdp/filter_dhcp_mismatch.c
RUN clang -O3 -target bpf -D __BPF_TRACING__ -D SPR_XDP_STANDALONE -I"/usr/include/$(gcc -print-multiarch)" -c /xdp/filter_dhcp_mismatch.c -o /filter_dhcp_mismatch.o

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
ARG SPRBUS_JSON_COMMIT=efdec19847c82ecb70f3eef936d10e2f934ff078
RUN git init /code/sprbus-json \
 && git -C /code/sprbus-json remote add origin https://github.com/spr-networks/sprbus-json \
 && git -C /code/sprbus-json fetch --depth 1 origin "${SPRBUS_JSON_COMMIT}" \
 && git -C /code/sprbus-json checkout --detach FETCH_HEAD
WORKDIR /code/sprbus-json/cmd/
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -trimpath -ldflags "-s -w" -o /sprbus

WORKDIR /code
COPY api/code/ /code/
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -trimpath -ldflags "-s -w" -o /api

FROM ${CONTAINER_TEMPLATE_REF}
ENV DEBIAN_FRONTEND=noninteractive
ARG UBUNTU_SNAPSHOT=20260930T000000Z
RUN set -eux; \
    printf 'Types: deb\nURIs: https://snapshot.ubuntu.com/ubuntu/%s\nSuites: noble noble-updates noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list.d/ubuntu.sources; \
    printf 'APT::Install-Recommends "false";\nAcquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99reproducible
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client git hostapd iw jc systemd macchanger xdp-tools && rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache && : > /etc/machine-id
COPY api/scripts /scripts/
# iw list json parser
RUN mkdir -p /root/.local/share/jc/jcparsers
COPY api/scripts/iw*.py /root/.local/share/jc/jcparsers/

COPY --from=builder /api /
COPY --from=builder /sprbus /
COPY --from=xdp-builder /filter_dhcp_mismatch.o /code/
ENTRYPOINT ["/scripts/startup.sh"]
