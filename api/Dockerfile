FROM --platform=linux/arm64 ubuntu:21.04 as builder
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates git curl clang
RUN mkdir /code
WORKDIR /code
RUN curl -O https://dl.google.com/go/go1.17.linux-arm64.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-arm64.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"
ENV CC=clang
RUN go mod init api
RUN go get github.com/gorilla/mux
RUN go get github.com/gorilla/handlers
RUN go get github.com/duo-labs/webauthn
RUN go get github.com/duo-labs/webauthn.io/session
COPY code/api.go /code/
COPY code/auth.go /code/
RUN go mod tidy
RUN go build -ldflags "-s -w" -o /api /code/api.go /code/auth.go

FROM --platform=linux/arm64 ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y nftables iproute2 netcat inetutils-ping net-tools nano ca-certificates curl
RUN apt-get install -y hostapd
# Temporary until this is a mounted docker volume
COPY code/build/ /build/
COPY scripts /scripts/
COPY --from=builder /api /
ENTRYPOINT ["/scripts/startup.sh"]
