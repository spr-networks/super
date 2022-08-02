# code

eventbus used is:
git clone https://github.com/asaskevich/EventBus.git

forked for unix socket support + pr fixes @
git clone https://github.com/spr-networks/EventBus.git

still some bugs, see issues.

# setup

## prefixes

lan:in
lan:out

wan:in
wan:out

drop:input
drop:forward

## add log prefix + group to netfilter rules

NOTE: this is not added yet
see `update-netfilter-rules.sh` for script

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

# standalone client

code is almost the same in api/code/notifications.go

## run code in client-test (can run on host):
`cd client-test && go build && ./main`

NOTE this connects to unix socket eventbus listening on server.sock

# Notes

we use ulogd groups to categorize the packet:
* group 0 == allow
* group 1 == deny

ulogd sets "action" to allowed or blocked depending on the group.

## json format

see code/types.go for golang struct of ulogd json format. also used in api/code/notifications.go

example packet:

```json
{"timestamp": "2022-07-25T15:01:58.947620+0200", "dvc": "spr", "raw.pktlen": 64, "raw.pktcount": 1, "oob.prefix": "DRP:INP ", "oob.time.sec": 1658754118, "oob.time.usec": 947620, "oob.mark": 0, "oob.ifindex_in": 3, "oob.hook": 1, "raw.mac_len": 14, "oob.family": 10, "oob.protocol": 34525, "action": "blocked", "raw.type": 1, "raw.mac.addrlen": 6, "ip.protocol": 58, "ip6.payloadlen": 24, "ip6.priority": 0, "ip6.flowlabel": 0, "ip6.hoplimit": 255, "ip6.nexthdr": 58, "icmpv6.type": 134, "icmpv6.code": 0, "icmpv6.csum": 57001, "oob.in": "wlan0", "oob.out": "", "src_ip": "fe80::dad7:75ff:fef2:f959", "dest_ip": "ff02::1", "mac.saddr.str": "d8:d7:75:f2:f9:59", "mac.daddr.str": "33:33:00:00:00:01", "mac.str": "33:33:00:00:00:01:d8:d7:75:f2:f9:59:86:dd"}
```

# Api code

notifications.go is run in api & forward the messages to websocket if user have set this up

settings for when to notify:
* have a notifications.json
* use netfilter prefix + other filters like `src_ip` and `dest_ip`
* log = true/false

when event is received check against setting if we should forward to websocket

# Issues

two bugs that need fixing:

* calling .publish after disconnect crash
* reconnecting -- receive +1 events for each connection

need to fix the reconnect-bug, restarting api results in 2msgs etc.

TODO need a way to handle if packet_logs container is restarted - client in api dropped?

the eventbus is a bit wonky with +1 connections
cleanup of handlers / subscribers might result in this error:

```
panic: runtime error: invalid memory address or nil pointer dereference 
        panic: runtime error: invalid memory address or nil pointer dereference
[signal SIGSEGV: segmentation violation code=0x1 addr=0x0 pc=0x2dc7bc]
```

call .Publish on a disconnected client
Try to resolve this by connecting to verify client is alive but fail sometimes
