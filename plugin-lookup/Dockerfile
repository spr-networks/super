FROM ubuntu:21.04 as builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y git curl
ARG TARGETARCH
RUN curl -O https://dl.google.com/go/go1.17.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
RUN mkdir /code
WORKDIR /code
COPY code/ /code/
RUN --mount=type=tmpfs,target=/root/go/ (go build -ldflags "-s -w" -o /lookup_plugin /code/lookup_plugin.go)

FROM ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y curl
COPY scripts /scripts/
COPY data /data/
COPY --from=builder /lookup_plugin /
ENTRYPOINT ["/scripts/startup.sh"]
