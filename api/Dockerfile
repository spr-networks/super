FROM ubuntu:21.04 as builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates git curl
RUN mkdir /code
WORKDIR /code
ARG TARGETARCH
RUN curl -O https://dl.google.com/go/go1.17.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
COPY code/ /code/

WORKDIR /code
RUN --mount=type=tmpfs,target=/root/go/ (go build -ldflags "-s -w" -o /api)


FROM ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates curl hostapd systemd jq jc iw
COPY scripts /scripts/
# iw list json parser
RUN mkdir -p /root/.local/share/jc/jcparsers
COPY scripts/iw_*.py /root/.local/share/jc/jcparsers

COPY --from=builder /api /
ENTRYPOINT ["/scripts/startup.sh"]
