# syntax=docker/dockerfile:1@sha256:87999aa3d42bdc6bea60565083ee17e86d1f3339802f543c0d03998580f9cb89
ARG NODE_REF=node:18@sha256:c6ae79e38498325db67193d391e6ec1d224d96c693a8a4d943498556716d3783
ARG ALPINE_REF=alpine@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b
ARG SOURCE_DATE_EPOCH

FROM --platform=$BUILDPLATFORM ${NODE_REF} AS build

WORKDIR /app
COPY . ./
# Normalize source modes so yarn-build's output directories don't inherit
# whatever umask the host clone happened to use.
RUN find . -exec chmod go-w {} +
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
