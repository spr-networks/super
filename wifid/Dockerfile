FROM --platform=linux/arm ubuntu
RUN apt-get update && apt-get dist-upgrade -y
RUN apt-get install -y iptables iproute2 netcat inetutils-ping
RUN apt-get install -y net-tools
RUN apt-get install -y nano
RUN apt-get install -y ca-certificates
RUN apt-get install -y hostapd
COPY scripts /scripts
COPY configs /configs
ENTRYPOINT /scripts/startup.sh
