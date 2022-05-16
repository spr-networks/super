FROM ubuntu:21.04 as builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates git curl
RUN mkdir /code/
WORKDIR /code/
ARG TARGETARCH
RUN curl -O https://dl.google.com/go/go1.17.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
RUN git clone https://github.com/TimothyYe/godns.git
WORKDIR godns/cmd/godns
RUN go mod download
RUN go build
WORKDIR /code/
COPY code/* .
RUN go build

FROM ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends ca-certificates nftables iproute2 netcat inetutils-ping net-tools nano
COPY --from=builder /code/godns/cmd/godns/godns /
COPY --from=builder /code/dyndns_plugin /
ENTRYPOINT ["/dyndns_plugin"]
