FROM ubuntu:23.04 AS builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat-traditional inetutils-ping net-tools nano ca-certificates git curl
RUN mkdir /code
WORKDIR /code
ARG TARGETARCH
RUN curl -O https://dl.google.com/go/go1.21.5.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.21.5.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
COPY code/ /code/
WORKDIR /code
RUN go build -ldflags "-s -w" -o /packet_logs
COPY stream-json-logs/ /code/stream-json-logs
WORKDIR /code/stream-json-logs
RUN go build -ldflags "-s -w" -o /stream-json-logs

FROM ghcr.io/spr-networks/container_template:latest
ENV DEBIAN_FRONTEND=noninteractive
COPY scripts /scripts/
COPY --from=builder /packet_logs /
COPY --from=builder /stream-json-logs /
ENTRYPOINT ["/scripts/startup.sh"]
