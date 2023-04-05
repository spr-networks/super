
currently we store data in bolt db.
see documentation and code in code/boltapi.go for more information.

can switch engine easily with cmd packages

cmd/boltapi/main.go can be used to view database:

```bash
make
./boltapi --help
./boltapi --dbpath ../../state/plugins/db/logs.db --dump
./boltapi -b log:api
```

# TODO

* boltdb - add to makefile:
```yaml
install:
    go install github.com/spr-networks/super
```

* same api routes and methods should be used for other integrations
* future: add more paths and handlers to Serve for new db engines.

**logrotate**
* lumberjack: https://github.com/natefinch/lumberjack
* run in thread, have a config for logs so user can cap what/when to rotate

* use sprbus / signal to tell main ton reopen a fresh db fd

## howto send logs with curl

```bash
TOKEN="api-token"

curl -si -H "Authorization: Bearer $TOKEN" \
    spr/plugins/db/buckets

curl -si -H "Authorization: Bearer $TOKEN" \
    -X PUT -H "Content-Type: application/json" \
    --data '{"name":"log:test"}'
    spr/plugins/db/buckets

curl -si -H "Authorization: Bearer $TOKEN" \
    -X PUT -H "Content-Type: application/json" \
    --data '{"key":"2234", "value": {"msg":"testmsg2", "test":"bbbb"}}' \
    spr/plugins/db/bucket/log:test

curl -si -H "Authorization: Bearer $TOKEN" \
    spr/plugins/db/bucket/log:test
```
