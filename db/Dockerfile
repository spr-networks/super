FROM rust:1-trixie AS builder
RUN mkdir /code
WORKDIR /code
COPY code/ /code/

ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    if [ "$USE_TMPFS" = "true" ]; then \
      export CARGO_HOME=/tmpfs/cargo CARGO_TARGET_DIR=/tmpfs/target; \
    fi; \
    cargo build --release && cp ${CARGO_TARGET_DIR:-target}/release/dbapi /dbapi

FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && rm -rf /var/lib/apt/lists/*
COPY scripts /scripts/
COPY --from=builder /dbapi /
ENTRYPOINT ["/scripts/startup.sh"]
