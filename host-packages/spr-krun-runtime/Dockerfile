ARG DEBIAN_REF=debian:trixie@sha256:9cc080028c43b27d2074d63a5f9caf7166d731494965616c1a6d2827a004585c
FROM ${DEBIAN_REF}

ENV DEBIAN_FRONTEND=noninteractive

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
