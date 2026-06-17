# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:295e44462ab12776c716e28a64dc5a00131576d606e7db6189af2f7869b9bb4e
ARG SOURCE_DATE_EPOCH

FROM gobuilder AS builder
ARG COREDNS_COMMIT=17fceec6d93fd1dde5ba6888c363f131ff6d647f
RUN git init coredns \
 && git -C coredns remote add origin https://github.com/coredns/coredns.git \
 && git -C coredns fetch --depth 1 origin "${COREDNS_COMMIT}" \
 && git -C coredns checkout --detach FETCH_HEAD
WORKDIR /code/coredns/

# Use minimal plugin.cfg — only plugins SPR actually needs
COPY plugin.cfg .

# SPR CoreDNS plugins, pinned to commits
ARG COREDNS_JSONLOG_COMMIT=5f94aa7d00b823e58f3bc6ace3e03efc26886afa
ARG COREDNS_BLOCK_COMMIT=8b2a08eb180013f1d22d266ed80149f442fd06fe
ARG COREDNS_SPR_CACHE_COMMIT=8f24c9bf05f18e5ed248da4df92c8087f161dbf1
ARG COREDNS_SPR_FORWARD_COMMIT=05d8f874e165b3f940679fde53b0adf62384d00a
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
   [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
   go generate && \
   go get github.com/spr-networks/coredns-jsonlog@${COREDNS_JSONLOG_COMMIT} && \
   go get github.com/spr-networks/coredns-block@${COREDNS_BLOCK_COMMIT} && \
   go get github.com/spr-networks/coredns-spr_cache@${COREDNS_SPR_CACHE_COMMIT} && \
   go get github.com/spr-networks/coredns-spr_forward@${COREDNS_SPR_FORWARD_COMMIT} && \
   go generate && \
   go mod tidy && \
   CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /coredns

FROM ${CONTAINER_TEMPLATE_REF}
ENV DEBIAN_FRONTEND=noninteractive
COPY --from=builder /coredns /
COPY scripts/ /scripts
ENTRYPOINT ["/scripts/startup.sh"]
