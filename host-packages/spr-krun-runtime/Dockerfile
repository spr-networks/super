ARG DEBIAN_REF=debian:trixie@sha256:9c6e381421d0f48d1b8133e573f33c185ee16cbf505eda9c4a8a4791b25ea8a6
FROM ${DEBIAN_REF}

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --only-upgrade apt '?and(?installed,?source-package(^apt$))' \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' apt)" ge 3.0.4 \
    && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' libapt-pkg7.0)" ge 3.0.4 \
    && apt-get install -y --no-install-recommends \
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
