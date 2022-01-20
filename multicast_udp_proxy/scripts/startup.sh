#!/bin/bash
. /configs/base/config.sh
ARG=""
if [ -z $LANIF ]; then
  ARG=$VLANSIF
else
  ARG=$LANIF,$VLANSIF
fi

/code/multicastproxy $ARG
