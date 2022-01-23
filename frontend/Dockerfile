FROM node:14 as build

WORKDIR /app
COPY . ./

RUN --mount=type=tmpfs,target=/app/node_modules (yarn install; yarn run build)
