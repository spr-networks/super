#!/bin/bash

# TODO test in container

DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
DIR_DATA=$DIR/../data

rm -f $DIR_DATA/{ip2asn-v4.tsv,manuf}

cd $DIR_DATA && $DIR/download.sh

if ! [ -f $DIR_DATA/ip2asn-v4.tsv ]; then
    echo "- failed to download asn db"
    exit
fi

cd $DIR/../code && go test
