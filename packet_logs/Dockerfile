# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:295e44462ab12776c716e28a64dc5a00131576d606e7db6189af2f7869b9bb4e
ARG SOURCE_DATE_EPOCH

FROM gobuilder AS builder
COPY code/ /code/
WORKDIR /code
RUN go build -trimpath -ldflags "-s -w" -o /packet_logs
COPY stream-json-logs/ /code/stream-json-logs
WORKDIR /code/stream-json-logs
RUN go build -trimpath -ldflags "-s -w" -o /stream-json-logs

FROM ${CONTAINER_TEMPLATE_REF}
ENV DEBIAN_FRONTEND=noninteractive
COPY scripts /scripts/
COPY --from=builder /packet_logs /
COPY --from=builder /stream-json-logs /
ENTRYPOINT ["/scripts/startup.sh"]
