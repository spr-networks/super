FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y watchdog netbase
COPY scripts /scripts

ENTRYPOINT ["/scripts/startup.sh"]
