#!/bin/bash

DIR_TEST=/code

while true
do
  IFACE=$(ip -br link | grep wlan | awk '{print $1}' | head -n 1)
  if [ ! -z $IFACE ]; then

    echo "+ IFACE= $IFACE"

    dhclient -r $IFACE
    dhclient -nw $IFACE
    wpa_supplicant -B -Dnl80211 -i${IFACE} -c /w.conf

    cd $DIR_TEST && npm install
    echo "~ waiting for iface ip..."
    for x in $(seq 0 10); do
	    IP=$(ip -br addr show dev wlan5 | awk '{print $3}' | sed 's/\/.*//g')
	    if [ ! -z $IP ]; then
		    echo "+ IFACE= $IFACE, IP= $IP"

		    IP_AP=$(ip route show  dev wlan5 | head -1 | awk '{print $3}')
		    export API_URL="http://$IP_AP"
		    export AUTH="admin:admin"
		    echo "+ API_URL= $API_URL"

		    echo "+ RUNNING TESTS"
		    cd $DIR_TEST && npm run test
		    exit $?
	    fi
	    sleep 5
    done

    echo "- failed to get ip address. IFACE= $IFACE"
    exit
  fi
  sleep 5
done
