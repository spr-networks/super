#!/bin/bash

case "$reason" in
    BOUND|RENEW)
        # Commands to run when a lease is obtained or renewed
        GATEWAY=$(echo ${new_routers} | awk '{print $1}' | cut -d ',' -f1 | cut -d ';' -f1)
        NAME=$interface
        echo $GATEWAY > /state/dhcp-client/gateway.${NAME}
        ;;
    EXPIRE|FAIL)
        # Commands to run when a lease expires or fails
        ;;
    *)
        # Any other reason
        ;;
esac
