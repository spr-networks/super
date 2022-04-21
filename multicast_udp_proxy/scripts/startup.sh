#!/bin/bash
. /configs/base/config.sh
ARG=""
if [ -z $LANIF ]; then
  ARG=$VLANSIF,wg0
else
  ARG=$LANIF,$VLANSIF,wg0
fi

/code/multicastproxy $ARG
