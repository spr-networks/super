# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# check=skip=InvalidDefaultArgInFrom
ARG ALPINE_REF=alpine@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a
ARG UBUNTU_REF=ubuntu:24.04@sha256:fe81560990fae86dc4743202b2cb4d3df98d0bcf949173cecef15ce1127ef852
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:f49c51e1c57cafd60f4137f0810e3edfc7392f92cf5d106ed61a66c04d9277af
ARG SOURCE_DATE_EPOCH

FROM ${ALPINE_REF} AS cacerts

FROM ${UBUNTU_REF} AS builder
ENV DEBIAN_FRONTEND=noninteractive
ARG UBUNTU_SNAPSHOT=20261028T000000Z
ARG GO_VERSION=1.26.10
ARG GO_SHA256_AMD64=ccfe7ae822d2c2f41f4fe7c956199967a4dac22d0ee0d2b2bfdb440aab3b20c5
ARG GO_SHA256_ARM64=3f4227ce7b206a513e794f1393adb473a07b46e94d18bd15d1c684bbb7319797
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
COPY code/ /code/
WORKDIR /code/
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -trimpath -ldflags "-s -w" -o /superd

FROM ${CONTAINER_TEMPLATE_REF}
ENV DEBIAN_FRONTEND=noninteractive

ARG UBUNTU_SNAPSHOT=20261028T000000Z
ARG DOCKER_CE_VERSION=5:29.9.2-1~ubuntu.24.04~noble
ARG DOCKER_CE_CLI_VERSION=5:29.9.2-1~ubuntu.24.04~noble
ARG CONTAINERD_VERSION=2.4.2-3~ubuntu.24.04~noble
ARG DOCKER_BUILDX_PLUGIN_VERSION=0.38.1-1~ubuntu.24.04~noble
ARG DOCKER_COMPOSE_PLUGIN_VERSION=5.6.1-1~ubuntu.24.04~noble

RUN set -eux; \
    printf 'Types: deb\nURIs: https://snapshot.ubuntu.com/ubuntu/%s\nSuites: noble noble-updates noble-security\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' "${UBUNTU_SNAPSHOT}" > /etc/apt/sources.list.d/ubuntu.sources; \
    printf 'APT::Install-Recommends "false";\nAcquire::Check-Valid-Until "false";\n' > /etc/apt/apt.conf.d/99reproducible
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl
RUN install -m 0755 -d /etc/apt/keyrings
COPY scripts/docker.asc /etc/apt/keyrings/docker.asc
RUN chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
RUN echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null && \
apt-get update && \
apt-get install -y --no-install-recommends binutils \
  docker-ce=${DOCKER_CE_VERSION} \
  docker-ce-cli=${DOCKER_CE_CLI_VERSION} \
  containerd.io=${CONTAINERD_VERSION} \
  docker-buildx-plugin=${DOCKER_BUILDX_PLUGIN_VERSION} \
  docker-compose-plugin=${DOCKER_COMPOSE_PLUGIN_VERSION} \
  git openssh-client && \
strip --strip-unneeded \
/usr/bin/dockerd \
/usr/bin/containerd \
/usr/bin/docker \
/usr/bin/ctr \
/usr/bin/containerd-shim* \
/usr/libexec/docker/cli-plugins/* && \
apt-get remove -y binutils && \
rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache


COPY --from=builder /superd /
COPY scripts /scripts
COPY scripts/docker-compose /usr/bin/docker-compose
RUN git config --global --add safe.directory /super
ENTRYPOINT ["/scripts/startup.sh"]
