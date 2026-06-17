# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:295e44462ab12776c716e28a64dc5a00131576d606e7db6189af2f7869b9bb4e
ARG SOURCE_DATE_EPOCH

FROM gobuilder AS builder
ARG USE_TMPFS=true
COPY code/ /code/
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -trimpath -ldflags="-s -w" multicastproxy.go

FROM ${CONTAINER_TEMPLATE_REF}
ENV DEBIAN_FRONTEND=noninteractive
RUN mkdir /code/
COPY --from=builder /code/multicastproxy /code/
COPY scripts /scripts/

ENTRYPOINT ["/scripts/startup.sh"]
