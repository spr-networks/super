FROM --platform=linux/arm64 ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y watchdog
COPY scripts /scripts
COPY configs /configs

ENTRYPOINT /scripts/startup.sh
