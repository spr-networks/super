
currently we store data in bolt db.

see documentation and code in code/boltapi.go for more information.

can switch engine easily with cmd packages

cmd/boltapi/main.go can be used to view database:

```bash

make
./boltapi --dbpath=../../state/plugins/db/logs.db --dump
./boltapi -b log:api

```

# TODO

* same api routes and methods should be used for other integrations
* in Server method wee add paths for each db engine
```go
```
