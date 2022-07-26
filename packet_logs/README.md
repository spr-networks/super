
# setup

## add log prefix + group to netfilter rules

NOTE: this is not added yet

nft rules *need* a group set to work, replace these:

    counter log prefix "DRP:PFW "
    counter log prefix "DRP:FWD "
    counter log prefix "DRP:INP "
    counter log prefix "DRP:MAC "
    counter log prefix "DRP:FWD "
    counter log prefix "DRP:INP "

to have group 1 (marks it as deny):

    counter log prefix "DRP:INP " group 1

add rules to log all outgoing traffic with group 0:

```sh
POS=$(sudo nft -a list ruleset | grep '@internet_access'|sed 's/.*# handle //g')
sudo nft add rule inet filter FORWARD position $POS counter oifname \"eth0\" log prefix \"ip:out \" group 0
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

## run code in client-test (can run on host):
`cd client-test && go build && ./main`

NOTE this connects to network eventbus listening on localhost:2020

# ideas

 we have actions in the json
also oob.prefix - use this to categorize the packets more - what type of drop etc.
can be matched by the handlers:

publish("DRP:INP") -> subscribe("nft:drop:inp", handleDropInput(json))

# format

TODO need a good format on netfilter prefix for lan/wan or drp/ip out/in traffic

## Notes

we use ulogd groups to categorize the packet:
* group 0 == allow
* group 1 == deny

ulogd sets "action" to allowed or blocked depending on the group.

## json format

```json
{"timestamp": "2022-07-25T15:01:58.947620+0200", "dvc": "spr", "raw.pktlen": 64, "raw.pktcount": 1, "oob.prefix": "DRP:INP ", "oob.time.sec": 1658754118, "oob.time.usec": 947620, "oob.mark": 0, "oob.ifindex_in": 3, "oob.hook": 1, "raw.mac_len": 14, "oob.family": 10, "oob.protocol": 34525, "action": "blocked", "raw.type": 1, "raw.mac.addrlen": 6, "ip.protocol": 58, "ip6.payloadlen": 24, "ip6.priority": 0, "ip6.flowlabel": 0, "ip6.hoplimit": 255, "ip6.nexthdr": 58, "icmpv6.type": 134, "icmpv6.code": 0, "icmpv6.csum": 57001, "oob.in": "wlan0", "oob.out": "", "src_ip": "fe80::dad7:75ff:fef2:f959", "dest_ip": "ff02::1", "mac.saddr.str": "d8:d7:75:f2:f9:59", "mac.daddr.str": "33:33:00:00:00:01", "mac.str": "33:33:00:00:00:01:d8:d7:75:f2:f9:59:86:dd"}
```

see code/types.go for go struct

# TODO

change eventbus to listen on unix sockets

client-test code should be run in api & forward the messages to websocket if user have set this up

settings for when to notify:
* have a notifications.json
* use netfilter prefix + other filters like `src_ip` and `dest_ip`
* log = true/false

when event is received check against setting if we should forward to websocket
