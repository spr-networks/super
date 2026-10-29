# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:f49c51e1c57cafd60f4137f0810e3edfc7392f92cf5d106ed61a66c04d9277af
ARG SOURCE_DATE_EPOCH
FROM ${CONTAINER_TEMPLATE_REF}
ENV DEBIAN_FRONTEND=noninteractive
ARG UBUNTU_SNAPSHOT=20261028T000000Z
RUN set -eux; \
    printf 'Types: deb\nURIs: https://snapshot.ubuntu.com/ubuntu/%s\nSuites: noble noble-updates noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list.d/ubuntu.sources; \
    printf 'APT::Install-Recommends "false";\nAcquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99reproducible
RUN apt-get update && apt-get install -y --no-install-recommends jq ppp && rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache
COPY scripts /scripts
ENTRYPOINT ["/scripts/startup.sh"]
