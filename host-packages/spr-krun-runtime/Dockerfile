ARG DEBIAN_REF=debian:bullseye@sha256:6cb68b1be980a0e5b19be25582b34b5cf9cb466d52d08ab4354b79051f2cd298
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
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY . .

ARG SOURCE_DATE_EPOCH=0
ARG MAKE_JOBS=4
RUN MAKE_JOBS="$MAKE_JOBS" ./build.sh /out

FROM scratch
COPY --from=0 /out/ /
