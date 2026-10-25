# Build host for the rpi-image-gen SPR image: Debian trixie arm64 with
# rpi-image-gen at a pinned commit, its dependencies, and the tools
# build.sh uses to fetch and verify SPR's binaries (cosign, skopeo, gh).
# rpi-image-gen runs as a regular user and needs CAP_SYS_ADMIN, so the
# container runs --privileged as user build.
FROM debian:trixie

ARG RPI_IMAGE_GEN_COMMIT=d2d5705bcb37284c4b08c0ce43c039b1f1004e25

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git sudo curl jq zstd \
      cosign skopeo \
    && rm -rf /var/lib/apt/lists/*

# gh from GitHub's apt repository: Debian's has no `gh attestation`
# (fetch-spr-kernel.sh)
RUN curl -fsSL -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
      https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    && echo "deb [arch=arm64 signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

RUN git clone https://github.com/raspberrypi/rpi-image-gen /opt/rpi-image-gen \
    && git -C /opt/rpi-image-gen checkout --detach ${RPI_IMAGE_GEN_COMMIT}

RUN apt-get update && /opt/rpi-image-gen/install_deps.sh \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash build \
    && echo 'build ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/build \
    && echo 'build:100000:65536' > /etc/subuid \
    && echo 'build:100000:65536' > /etc/subgid
# owned by the building user, who is root in the build's user namespace:
# layers copy their overlays with rsync -a, which keeps the owner, and a
# root-owned checkout's files would land in the image as nobody's
RUN chown -R build:build /opt/rpi-image-gen

USER build
WORKDIR /home/build
