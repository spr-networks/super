# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
ARG CONTAINER_TEMPLATE_REF=ghcr.io/spr-networks/container_template@sha256:295e44462ab12776c716e28a64dc5a00131576d606e7db6189af2f7869b9bb4e
ARG SOURCE_DATE_EPOCH

FROM gobuilder AS builder
ARG SPRBUS_JSON_COMMIT=efdec19847c82ecb70f3eef936d10e2f934ff078
RUN git init /code/sprbus-json \
 && git -C /code/sprbus-json remote add origin https://github.com/spr-networks/sprbus-json \
 && git -C /code/sprbus-json fetch --depth 1 origin "${SPRBUS_JSON_COMMIT}" \
 && git -C /code/sprbus-json checkout --detach FETCH_HEAD
WORKDIR /code/sprbus-json/cmd/
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -trimpath -ldflags "-s -w" -o /sprbus

WORKDIR /code
COPY code/ /code/
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && ln -s /tmpfs /root/go; \
    go build -trimpath -ldflags "-s -w" -o /api

FROM ${CONTAINER_TEMPLATE_REF}
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends openssh-client git hostapd iw jc systemd macchanger && rm -rf /var/lib/apt/lists/* /var/log/* /var/cache/ldconfig/aux-cache && : > /etc/machine-id
COPY scripts /scripts/
# iw list json parser
RUN mkdir -p /root/.local/share/jc/jcparsers
COPY scripts/iw*.py /root/.local/share/jc/jcparsers/

COPY --from=builder /api /
COPY --from=builder /sprbus /
ENTRYPOINT ["/scripts/startup.sh"]
