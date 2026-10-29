# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
ARG ALPINE_REF=alpine@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:f49c51e1c57cafd60f4137f0810e3edfc7392f92cf5d106ed61a66c04d9277af
ARG SOURCE_DATE_EPOCH

FROM ${ALPINE_REF} AS rust-client
ARG TARGETARCH
ARG OXWIFID_VERSION=0.1.9
ARG OXWIFID_ARM64_URL=https://github.com/spr-networks/oxwifid/releases/download/v0.1.9/barely-ap-v0.1.9-aarch64-unknown-linux-musl.tar.gz
ARG OXWIFID_ARM64_ARCHIVE_SHA256=2003c200ca53fcbd4806dc3d99394f42df4b22a5750c34e6f2e74fadba79b52d
ARG OXWIFID_BARELY_CLI_ARM64_SHA256=11440c3df813e584c7c7b3de21aa03824c9a6c12ff501964e00b57a5fdae35ea
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
ARG UBUNTU_SNAPSHOT=20261028T000000Z
RUN set -eux; \
    printf 'Types: deb\nURIs: https://snapshot.ubuntu.com/ubuntu/%s\nSuites: noble noble-updates noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list.d/ubuntu.sources; \
    printf 'APT::Install-Recommends "false";\nAcquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99reproducible
RUN apt-get update && apt-get install -y --no-install-recommends isc-dhcp-client jq wpasupplicant wireless-regdb && rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache
COPY --from=rust-client /barely-cli /usr/local/sbin/barely-cli
COPY scripts /scripts
ENTRYPOINT ["/scripts/startup.sh"]
