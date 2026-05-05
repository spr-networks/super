FROM ubuntu:24.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat-traditional inetutils-ping net-tools nano ca-certificates git curl wget unzip
RUN mkdir /code/
WORKDIR /code/
ARG TARGETARCH
RUN wget https://dl.google.com/go/go1.24.2.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.24.2.linux-${TARGETARCH}.tar.gz
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/usr/local/go/bin:/root/.bun/bin:$PATH"
RUN git clone --branch v3.4.1 https://github.com/TimothyYe/godns.git
ARG USE_TMPFS=true
WORKDIR /code/godns/web
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/.bun/install/cache; \
    bun install --frozen-lockfile && bun run build
WORKDIR /code/godns
RUN go generate ./...
WORKDIR /code/godns/cmd/godns
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go mod download && go build
WORKDIR /code/
COPY code/* .
RUN --mount=type=tmpfs,target=/tmpfs go build

FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
COPY --from=builder /code/godns/cmd/godns/godns /
COPY --from=builder /code/dyndns_plugin /
ENTRYPOINT ["/dyndns_plugin"]
