# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
# check=skip=InvalidDefaultArgInFrom
ARG ALPINE_REF
ARG UBUNTU_REF
ARG CONTAINER_TEMPLATE_REF
ARG SOURCE_DATE_EPOCH

FROM ${ALPINE_REF} AS cacerts

FROM ${UBUNTU_REF} AS builder
ENV DEBIAN_FRONTEND=noninteractive
ARG UBUNTU_SNAPSHOT
ARG GO_VERSION
ARG GO_SHA256_AMD64
ARG GO_SHA256_ARM64
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

ARG DOCKER_CE_VERSION=5:29.5.3-1~ubuntu.24.04~noble
ARG DOCKER_CE_CLI_VERSION=5:29.5.3-1~ubuntu.24.04~noble
ARG CONTAINERD_VERSION=2.2.4-1~ubuntu.24.04~noble
ARG DOCKER_BUILDX_PLUGIN_VERSION=0.34.1-1~ubuntu.24.04~noble
ARG DOCKER_COMPOSE_PLUGIN_VERSION=5.1.4-1~ubuntu.24.04~noble

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
