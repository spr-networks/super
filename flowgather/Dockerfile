FROM Ubuntu:24.04 as builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat-traditional inetutils-ping net-tools nano ca-certificates git curl wget
RUN apt-get install -y --no-install-recommends clang
RUN apt-get install -y --no-install-recommends libpcap-dev
RUN mkdir /code
WORKDIR /code
ARG TARGETARCH
RUN wget https://dl.google.com/go/go1.24.2.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.24.2.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
ENV CC=clang
COPY code/ /code/
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go mod tidy && go build -ldflags="-s -w" -o /flowgather
COPY scripts /scripts/

FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
RUN mkdir /data
COPY --from=/flowgather /
ENTRYPOINT ["/scripts/startup.sh"]
