FROM ubuntu:23.04 as builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends git curl ca-certificates
ARG TARGETARCH
RUN curl -O https://dl.google.com/go/go1.20.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.20.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
RUN mkdir /code
WORKDIR /code
COPY code/ /code/
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -ldflags "-s -w" -o /lookup_plugin /code/lookup_plugin.go

FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
COPY scripts /scripts/
COPY data /data/
COPY --from=builder /lookup_plugin /
ENTRYPOINT ["/scripts/startup.sh"]
