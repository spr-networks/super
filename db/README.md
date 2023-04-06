
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
AUTH="Authorization: Bearer $TOKEN"

# list buckets
curl -si -H "$AUTH" spr/plugins/db/buckets

# add bucket
curl -si -H "$AUTH" \
    -X PUT --data '{"name":"log:test"}' \
    spr/plugins/db/buckets

# add value with key to bucket
curl -si -H "$AUTH" \
    -X PUT --data '{"key":"1234", "value": {"msg":"test"}}' \
    spr/plugins/db/bucket/log:test

# get entries in bucket
curl -si -H "$AUTH" spr/plugins/db/bucket/log:test

# get only values for bucket
curl -si -H "$AUTH" spr/plugins/db/items/log:test
```

Note: its not required to create a bucket before sending data to it.
If it doesnt exist it will be created, example:
```bash
curl -si -H "$AUTH" \
    -X PUT --data '{"key":"1234", "value": {"msg":"test"}}' \
    spr/plugins/db/bucket/log:testtmp

curl -si -H "$AUTH" spr/plugins/db/items/log:testtmp
```
