FROM --platform=$BUILDPLATFORM node:18 as build

WORKDIR /app
COPY . ./
ARG USE_TMPFS=true
RUN --mount=type=tmpfs,target=/tmpfs \
    [ "$USE_TMPFS" = "true" ] && \
        mkdir /tmpfs/cache /tmpfs/node_modules && \
        ln -s /tmpfs/node_modules /app/node_modules && \
        ln -s /tmpfs/cache /usr/local/share/.cache; \
    yarn install --network-timeout 86400000 && yarn run build

FROM alpine
COPY --from=build /app/build/ /app/build/
