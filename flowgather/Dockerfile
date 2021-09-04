FROM --platform=linux/arm64 ubuntu:21.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get dist-upgrade -y
RUN apt-get install -y nftables iproute2 netcat inetutils-ping
RUN apt-get install -y net-tools
RUN apt-get install -y nano
RUN apt-get install -y ca-certificates

RUN apt-get install -y git
RUN mkdir /code
WORKDIR /code

RUN apt-get install -y curl
RUN curl -O https://dl.google.com/go/go1.17.linux-arm64.tar.gz
RUN rm -rf /usr/local/go && tar -C /usr/local -xzf go1.17.linux-arm64.tar.gz
ENV PATH="/usr/local/go/bin:$PATH"

RUN apt-get install -y clang
RUN apt-get install -y libpcap-dev

ENV CC=clang

# incremental build for testing
COPY code/go.mod /code/
COPY code/go.sum /code/
RUN go get github.com/dreadl0ck/ja3                                                                            
RUN go get github.com/google/gopacket                                                                          
RUN go get github.com/google/gopacket/layers                                                                   
RUN go get github.com/google/gopacket/pcap                                                                     
RUN go get github.com/mattn/go-sqlite3                                                                         
RUN go get github.com/vishvananda/netlink                                                                      
RUN go get golang.org/x/sys/unix                                                                               
RUN go get crawshaw.io/sqlite/sqlitex

COPY code/main.go /code/
RUN go build -o /flowgather

#build
#COPY code/ /code/
#RUN --mount=type=tmpfs,target=/root/go/ go mod tidy && go build -o /flowgather

COPY scripts /scripts/

WORKDIR /
ENTRYPOINT ["/scripts/startup.sh"]
