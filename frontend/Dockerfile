FROM node:17 as build

WORKDIR /app
COPY . ./
RUN --mount=type=tmpfs,target=/app/node_modules (yarn install; yarn run build)

FROM scratch
COPY --from=build /app/ /app
