FROM --platform=$BUILDPLATFORM node:17 as build

WORKDIR /app
COPY . ./
RUN --mount=type=tmpfs,target=/app/node_modules --mount=type=tmpfs,target=/usr/local/share/ (yarn install; yarn run build)

FROM scratch
COPY --from=build /app/build/ /app/build/
