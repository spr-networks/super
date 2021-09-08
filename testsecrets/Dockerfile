FROM --platform=linux/arm64 ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update
RUN apt-get install -y git
RUN mkdir /code
WORKDIR /code

# Test secrets
ARG GITHUB_CREDS=github.com
ENV ENV_GITHUB_CREDS=$GITHUB_CREDS
RUN git config --global url."https://${ENV_GITHUB_CREDS}".insteadOf "https://github.com"
RUN git clone https://github.com/SPR-Fi/coredhcp
WORKDIR /code/coredhcp
