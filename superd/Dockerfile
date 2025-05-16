FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat-traditional inetutils-ping net-tools nano ca-certificates git curl wget
RUN mkdir /code
WORKDIR /code
ARG TARGETARCH
RUN wget https://dl.google.com/go/go1.24.2.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.24.2.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
COPY code/ /code/
WORKDIR /code/
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -ldflags "-s -w" -o /superd

FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update
RUN apt-get install ca-certificates curl
RUN install -m 0755 -d /etc/apt/keyrings
COPY scripts/docker.asc /etc/apt/keyrings/docker.asc
RUN chmod a+r /etc/apt/keyrings/docker.asc

# Add the repository to Apt sources:
RUN echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null && \
apt-get update && \
apt-get install -y --no-install-recommends binutils docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin git openssh-client && \
strip --strip-unneeded \
/usr/bin/dockerd \
/usr/bin/containerd \
/usr/bin/docker \
/usr/bin/ctr \
/usr/bin/containerd-shim* \
/usr/libexec/docker/cli-plugins/* && \
apt-get remove -y binutils && \
rm -rf /var/lib/apt/lists/*


COPY --from=builder /superd /
COPY scripts /scripts
COPY scripts/docker-compose /usr/bin/docker-compose
RUN git config --global --add safe.directory /super
ENTRYPOINT ["/scripts/startup.sh"]
