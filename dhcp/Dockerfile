# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:295e44462ab12776c716e28a64dc5a00131576d606e7db6189af2f7869b9bb4e
ARG SOURCE_DATE_EPOCH

FROM gobuilder AS builder
# Build CoreDHCP
ARG COREDHCP_COMMIT=380f8b1cb36d0747a2c0952f17d99cc79c801817
RUN git init coredhcp \
 && git -C coredhcp remote add origin https://github.com/spr-networks/coredhcp \
 && git -C coredhcp fetch --depth 1 origin "${COREDHCP_COMMIT}" \
 && git -C coredhcp checkout --detach FETCH_HEAD
WORKDIR /code/coredhcp
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -trimpath -ldflags "-s -w" -o /coredhcpd ./cmds/coredhcp && \
    go build -trimpath -ldflags "-s -w" -o /coredhcp_client ./cmds/exdhcp/dhclient/

FROM ${CONTAINER_TEMPLATE_REF}
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends jq ethtool isc-dhcp-client inotify-tools psmisc && rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache
COPY --from=builder /coredhcpd /
COPY --from=builder /coredhcp_client /
COPY scripts /scripts
COPY scripts/dhclient-gateway-hook.sh /etc/dhcp/dhclient-enter-hooks.d/spr-gateway

ENTRYPOINT ["/scripts/startup.sh"]
