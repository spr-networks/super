FROM --platform=linux/arm ubuntu
RUN apt-get update && apt-get dist-upgrade -y
RUN apt-get install -y iptables iproute2 netcat inetutils-ping
RUN apt-get install -y net-tools
RUN apt-get install -y nano
RUN apt-get install -y ca-certificates

RUN apt-get install -y git
RUN mkdir /code
WORKDIR /code

RUN apt-get install -y curl
RUN curl -O https://dl.google.com/go/go1.17.linux-armv6l.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-armv6l.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"

RUN apt-get install -y clang
RUN apt-get install -y libpcap-dev

ENV CC=clang
COPY code/ /code/

RUN --mount=type=tmpfs,target=/root/go/ go mod tidy && go build -o /flowgather

COPY scripts /scripts/

WORKDIR /
ENTRYPOINT ["/scripts/startup.sh"]
