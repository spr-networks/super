# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
ARG ALPINE_REF=alpine@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:869ada7b121e9a0c552674042d32e801da3c4d04145638d9e722918c6377e65f
ARG SOURCE_DATE_EPOCH

FROM ${ALPINE_REF} AS rust-client
ARG TARGETARCH
ARG OXWIFID_VERSION=0.1.6
ARG OXWIFID_ARM64_URL=https://github.com/spr-networks/oxwifid/releases/download/v0.1.6/barely-ap-v0.1.6-aarch64-unknown-linux-musl.tar.gz
ARG OXWIFID_ARM64_ARCHIVE_SHA256=25ee56295deed38526163cfa0f8b76467bffc752ec82dbfb7d679f9edf6e7e2c
ARG OXWIFID_BARELY_CLI_ARM64_SHA256=5da0d33d6df458360e632e8758d0c34f7e900c0c1bd59563a827748d43341141
RUN set -eux; \
    case "${TARGETARCH}" in \
      arm64) \
        archive=/tmp/oxwifid.tar.gz; \
        member="barely-ap-v${OXWIFID_VERSION}-aarch64-unknown-linux-musl/barely-cli"; \
        wget -q -O "${archive}" "${OXWIFID_ARM64_URL}"; \
        printf '%s  %s\n' "${OXWIFID_ARM64_ARCHIVE_SHA256}" "${archive}" | sha256sum -c -; \
        tar -xOzf "${archive}" "${member}" > /barely-cli; \
        printf '%s  %s\n' "${OXWIFID_BARELY_CLI_ARM64_SHA256}" /barely-cli | sha256sum -c -; \
        rm "${archive}";; \
      amd64) \
        printf '#!/bin/sh\necho "Rust wifi uplink is unavailable on linux/amd64" >&2\nexit 1\n' > /barely-cli;; \
      *) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1;; \
    esac; \
    chmod 0755 /barely-cli

FROM ${CONTAINER_TEMPLATE_REF}
ENV DEBIAN_FRONTEND=noninteractive
ARG UBUNTU_SNAPSHOT=20260701T000000Z
RUN set -eux; \
    printf 'Types: deb\nURIs: https://snapshot.ubuntu.com/ubuntu/%s\nSuites: noble noble-updates noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list.d/ubuntu.sources; \
    printf 'APT::Install-Recommends "false";\nAcquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99reproducible
RUN apt-get update && apt-get install -y --no-install-recommends isc-dhcp-client jq wpasupplicant wireless-regdb && rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache
COPY --from=rust-client /barely-cli /usr/local/sbin/barely-cli
COPY scripts /scripts
ENTRYPOINT ["/scripts/startup.sh"]
