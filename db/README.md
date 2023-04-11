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

- same api routes and methods should be used for other integrations
- future: add more paths and handlers to Serve for new db engines.
- docusaurus

**logrotate**

- lumberjack: https://github.com/natefinch/lumberjack
- run in thread, have a config for logs so user can cap what/when to rotate

- use sprbus / signal to tell main to reopen a fresh db fd

## howto send logs with curl

by default current timestamp will be used as key

```bash
TOKEN="api-token"
AUTH="Authorization: Bearer $TOKEN"

# add data
curl -si -H "$AUTH" -X PUT "spr/bucket/log:test" --data '{"msg":"logmsg1"}'
curl -si -H "$AUTH" -X PUT "spr/bucket/log:test" --data '{"msg":"logmsg2"}'

# list items
curl -si -H "$AUTH" "spr/items/log:test jq .
[
  {
    "msg": "logmsg1",
    "time": "2023-04-06T11:55:43Z"
  },
  {
    "msg": "logmsg2",
    "time": "2023-04-06T11:55:46Z"
  }
]

# search
curl -s -H "$AUTH" 'spr/plugins/db/items/log:test?min=2023-04-06T16:14:45Z&max=2023-04-06T16:15:45Z' | jq .

# delete items
curl -X DELETE -s "spr/bucket/log:test"
```

for more control & setting key/values:

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

Note: If a bucket does not exist when adding data it will be created.
