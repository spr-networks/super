FROM --platform=linux/arm64 node:14 as build

WORKDIR /app
COPY . ./

RUN --mount=type=tmpfs,target=/app/node_modules (npm install; npm run build)
