#!/bin/sh
rm flowgather.db
sqlite3 flowgather.db < migrations/001-initial-schema.sql 

