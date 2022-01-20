FROM --platform=linux/arm64 ubuntu:21.04 as builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates git curl clang
RUN apt-get install -y libpcap-dev
RUN mkdir /code
WORKDIR /code
RUN curl -O https://dl.google.com/go/go1.17.linux-arm64.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-arm64.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
ENV CC=clang
COPY code/ /code/
RUN --mount=type=tmpfs,target=/root/go/ go mod tidy && go build -ldflags="-s -w" -o /flowgather
COPY scripts /scripts/

FROM --platform=linux/arm64 ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates curl
RUN mkdir /data
COPY --from=/flowgather /
ENTRYPOINT ["/scripts/startup.sh"]
