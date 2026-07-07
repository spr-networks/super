# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:869ada7b121e9a0c552674042d32e801da3c4d04145638d9e722918c6377e65f
ARG SOURCE_DATE_EPOCH
FROM ${CONTAINER_TEMPLATE_REF}
ENV DEBIAN_FRONTEND=noninteractive
ARG UBUNTU_SNAPSHOT
RUN set -eux; \
    printf 'Types: deb\nURIs: https://snapshot.ubuntu.com/ubuntu/%s\nSuites: noble noble-updates noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list.d/ubuntu.sources; \
    printf 'APT::Install-Recommends "false";\nAcquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99reproducible
RUN apt-get update && apt-get install -y --no-install-recommends conntrack iptables isc-dhcp-client && rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache
COPY scripts /scripts

ENTRYPOINT ["/scripts/startup.sh"]
