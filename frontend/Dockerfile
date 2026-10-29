# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
ARG NODE_REF=node:18@sha256:c6ae79e38498325db67193d391e6ec1d224d96c693a8a4d943498556716d3783
ARG ALPINE_REF=alpine@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a
ARG SOURCE_DATE_EPOCH

FROM --platform=$BUILDPLATFORM ${NODE_REF} AS build

WORKDIR /app
COPY . ./
# Normalize source modes so yarn-build's output directories don't inherit
# whatever umask the host clone happened to use.
RUN find . -exec chmod go-w {} +
RUN corepack enable
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    if [ "$USE_TMPFS" = "true" ]; then \
        mkdir /tmpfs/cache /tmpfs/node_modules && \
        ln -s /tmpfs/node_modules /app/node_modules && \
        ln -s /tmpfs/cache /usr/local/share/.cache && \
        export YARN_GLOBAL_FOLDER=/tmpfs/cache; \
    fi && \
    yarn install --immutable && yarn run build

FROM ${ALPINE_REF}
COPY --from=build /app/build/ /app/build/
