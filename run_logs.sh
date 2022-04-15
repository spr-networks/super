#!/bin/bash

# NOTE this script requires jq on the host system

LOGFILE="./state/logs/latest.json"
LOGDIR=$(dirname $LOGFILE)
if [ ! -d $LOGDIR ]; then
	mkdir $LOGDIR
	#sudo mount -t tmpfs -o size=50m tmpfs $(dirname $LOGFILE)
fi

echo "collecting logs every minute to $LOGFILE"

while true; do
	# NOTE if file is too big change --since yesterday to -n 10000 for example
	journalctl -u docker.service -r --since yesterday -o json | jq --slurp -c > $LOGFILE
	sleep 60
done
