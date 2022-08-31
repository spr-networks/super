# influx export

this code will subscribe to netfilter events from eventbus and store the results in InfluxDB.

buckets will have points called tcp and udp

## fetch and run influxdb

```sh
docker pull influxdb:2.4.0

DIR_INFLUXDB=$PWD
docker run -d --name=influxdb \
 -p 8086:8086 \
 -v  $DIR_INFLUXDB:/root/.influxdb2 \
      --net=influxdb-telegraf-net \
      influxdb:2.4.0

# can run telegraf for other stats
docker run --rm --name=telegraf \
      -v $PWD/telegraf.conf:/etc/telegraf/telegraf.conf \
      --net=influxdb-telegraf-net \
      telegraf
```

## setup influxdb settings in api.json

```json
...
 "InfluxDB": {
  "URL": "http://localhost:8086",
  "Org": "spr",     
  "Bucket": "spr", 
  "Token": "your-base64-token-here"
 }, 
...
```

## create buckets for stats

```sh
for n in lan:in lan:out wan:in wan:out drop:forward drop:input drop:mac drop:pfw; do
	docker exec -it influxdb influx bucket create -n "$n"; 
done
```
