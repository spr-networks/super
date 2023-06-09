FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends jq wpasupplicant wireless-regdb && rm -rf /var/lib/apt/lists/*
COPY scripts /scripts
ENTRYPOINT /scripts/startup.sh
