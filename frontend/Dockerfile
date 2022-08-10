FROM node:17 as build

WORKDIR /app
COPY . ./
RUN --mount=type=tmpfs,target=/app/node_modules --mount=type=tmpfs,target=/usr/local/share/ (yarn install; yarn run build)

FROM alpine
COPY --from=build /app/ /app
