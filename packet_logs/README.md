# code

The event bus is using moby pub-sub: 
https://github.com/spr-networks/sprbus

# setup

## flow

* ulogd get syslog msgs from /dev/log with netfilter log prefix + group and packet info
* ulogd logfile is read by code/main.go
* if prefix is matched, forward to eventbus
* api/client code is connected to eventbus listening for ntf: -prefixed messages
	* send to WebSocket if user specified to notify for this (filtered by log Prefix, DestIp, etc.)

## prefixes

lan:in
lan:out

wan:in
wan:out

drop:input
drop:forward
drop:mac

## add log prefix + group to netfilter rules

NOTE: this is not added yet
see `scripts/update-netfilter-rules.sh` for script

nft rules *need* a group set to work, replace these:

    counter log prefix "DRP:PFW "
    counter log prefix "DRP:FWD "
    counter log prefix "DRP:INP "
    counter log prefix "DRP:MAC "
    counter log prefix "DRP:FWD "
    counter log prefix "DRP:INP "

to have group 1 (marks it as deny):

    counter log prefix "drop:input " group 1

```sh
POS=$(sudo nft -a list ruleset | grep 'log prefix "DRP:MAC "'|sed 's/.*# handle //g')
sudo nft replace rule inet filter DROP_MAC_SPOOF handle $POS log prefix \"drop:mac \" group 1

POS=$(sudo nft -a list ruleset | grep -i 'log prefix "DRP:FWD "'|sed 's/.*# handle //g')
sudo nft replace rule inet filter DROPLOGFWD handle $POS log prefix \"drop:forward \" group 1

POS=$(sudo nft -a list ruleset | grep -i 'log prefix "DRP:INP "'|sed 's/.*# handle //g')
sudo nft replace rule inet filter DROPLOGINP handle $POS log prefix \"drop:input \" group 1
```

add rules to log all outgoing traffic with group 0:

```sh
POS=$(sudo nft -a list ruleset | grep '@internet_access'|head -1|sed 's/.*# handle //g')
sudo nft insert rule inet filter FORWARD position $POS counter oifname \"eth0\" log prefix \"wan:out \" group 0

POS=$(sudo nft -a list ruleset | grep 'jump F_EST_RELATED'|tail -1|sed 's/.*# handle //g')
sudo nft add rule inet filter INPUT position $POS log prefix \"lan:in \" group 0
```

now all outgoing traffic via the FORWARD chain will be makred as ip:out
and lan traffic via the INPUT chain is prefixed with lan:in

TODO log more

## build this container
same as other, add this to docker-compose:

```yaml
  packet_logs:
    container_name: superpacket_logs
    build: packet_logs
    network_mode: host
    privileged: true
    restart: always
    logging: *default-logging
    volumes:
      - ./state/plugins/packet_logs/:/state/plugins/packet_logs
      - ./configs/base/:/configs/base/
      - /dev/log:/dev/log
```

# standalone client

code is almost the same in api/code/notifications.go

## run code in client-test (can run on host):
`cd client-test && go build && ./main`

NOTE this connects to unix socket eventbus listening on server.sock

# Notes

we use netfilter groups to categorize the packet:
* group 0 == allow
* group 1 == deny

and set action depending on what group is set for the packet

## OLD log pcap files
* modifiy Dockerfile to add ulogd2-pcap
* enable pcap in ulogd.conf, see comments

```sh
mknod /state/plugins/packet_logs/ulogd.pcap p
docker-compose up -d packet_logs
tail -f /state/plugins/packet_logs/ulogd.pcap | tcpdump -r - -qtnp
```

## OLD json format

*NOTE* see client-influxdb for new example code.

see code/types.go for golang struct of ulogd json format. also used in api/code/notifications.go

example packet:

```json
{
  "timestamp": "2022-07-25T15:01:58.947620+0200",
  "dvc": "spr",
  "raw.pktlen": 64,
  "raw.pktcount": 1,
  "oob.prefix": "drop:input ",
  "oob.time.sec": 1658754118,
  "oob.time.usec": 947620,
  "oob.mark": 0,
  "oob.ifindex_in": 3,
  "oob.hook": 1,
  "raw.mac_len": 14,
  "oob.family": 10,
  "oob.protocol": 34525,
  "action": "blocked",
  "raw.type": 1,
  "raw.mac.addrlen": 6,
  "ip.protocol": 58,
  "ip6.payloadlen": 24,
  "ip6.priority": 0,
  "ip6.flowlabel": 0,
  "ip6.hoplimit": 255,
  "ip6.nexthdr": 58,
  "icmpv6.type": 134,
  "icmpv6.code": 0,
  "icmpv6.csum": 57001,
  "oob.in": "wlan0",
  "oob.out": "",
  "src_ip": "feff::ffff:ffff:ffff:ffff",
  "dest_ip": "ff02::1",
  "mac.saddr.str": "33:33:33:33:33:33",
  "mac.daddr.str": "33:33:33:33:33:33",
  "mac.str": "33:33:33:33:33:33:33:33:33:33:33:33:33:33"
}
```

# Api code

see client-influxdb in this repo for example usecase.

notifications.go is run in api & forward the messages to websocket if user have set this up

settings for when to notify:
* have a notifications.json
* use netfilter prefix + other filters like SrcIP and DstIP
* log = true/false

when event is received check against setting if we should forward to websocket
