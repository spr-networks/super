ARG DEBIAN_REF=debian:bullseye@sha256:6cb68b1be980a0e5b19be25582b34b5cf9cb466d52d08ab4354b79051f2cd298
FROM ${DEBIAN_REF}

ENV DEBIAN_FRONTEND=noninteractive

ARG DEBIAN_SNAPSHOT=20260901T000000Z
RUN set -eux; \
    printf 'deb [check-valid-until=no] http://snapshot.debian.org/archive/debian/%s bullseye main\ndeb [check-valid-until=no] http://snapshot.debian.org/archive/debian/%s bullseye-updates main\ndeb [check-valid-until=no] http://snapshot.debian.org/archive/debian-security/%s bullseye-security main\n' \
        "$DEBIAN_SNAPSHOT" "$DEBIAN_SNAPSHOT" "$DEBIAN_SNAPSHOT" \
        > /etc/apt/sources.list; \
    printf 'APT::Install-Recommends "false";\nAcquire::Check-Valid-Until "false";\n' \
        > /etc/apt/apt.conf.d/99reproducible

RUN apt-get update && apt-get install -y --no-install-recommends \
    autoconf \
    automake \
    bc \
    bison \
    build-essential \
    ca-certificates \
    cpio \
    curl \
    gettext \
    git \
    flex \
    libcap-dev \
    libclang-dev \
    libelf-dev \
    libjson-c-dev \
    libseccomp-dev \
    libsystemd-dev \
    libssl-dev \
    libtool \
    libyajl-dev \
    patchelf \
    pkg-config \
    python3 \
    python3-pyelftools \
    rsync \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .

ARG SOURCE_DATE_EPOCH=0
ARG MAKE_JOBS=4
RUN MAKE_JOBS="$MAKE_JOBS" ./build.sh /out

FROM scratch
COPY --from=0 /out/ /
