FROM ubuntu:22.04 as builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates git curl
RUN mkdir /code
WORKDIR /code
ARG TARGETARCH
RUN curl -O https://dl.google.com/go/go1.17.linux-${TARGETARCH}.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-${TARGETARCH}.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
COPY code/ /code/
WORKDIR /code/
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -ldflags "-s -w" -o /superd

FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates curl
RUN apt-get install -y --no-install-recommends \
    gnupg \
    lsb-release
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
RUN echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg]  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
RUN apt-get update
RUN apt-get install -y --no-install-recommends docker-ce-cli docker-compose git
COPY --from=builder /superd /
COPY scripts /scripts
RUN rm -rf /var/lib/apt/lists/*
ENTRYPOINT ["/scripts/startup.sh"]
