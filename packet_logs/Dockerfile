FROM ubuntu:22.04 as builder
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
RUN go build -ldflags "-s -w" -o /packet_logs

FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
#RUN apt-get update
#RUN apt-get install -y ulogd2 ulogd2-json #ulogd2-pcap

COPY scripts /scripts/
#COPY ulogd.conf /etc

COPY --from=builder /packet_logs /
ENTRYPOINT ["/scripts/startup.sh"]
