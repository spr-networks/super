FROM ubuntu:21.04 as builder
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

RUN --mount=type=tmpfs,target=/root/go/ (go build -ldflags "-s -w" -o /tailscale_plugin /code/tailscale_plugin.go)

FROM ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/hirsute.noarmor.gpg | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
RUN curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/hirsute.tailscale-keyring.list | sudo tee /etc/apt/sources.list.d/tailscale.list
RUN apt-get update
RUN apt-get install -y --no-install-recommends nftables iproute2 netcat inetutils-ping net-tools tailscale
COPY scripts /scripts/
COPY --from=builder /tailscale_plugin /
ENTRYPOINT ["/scripts/startup.sh"]
