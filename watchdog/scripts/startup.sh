#!/bin/bash

if [ ! -f /dev/watchdog ]; then
  cat > /configs/watchdog/watchdog.conf << EOF
watchdog-device = /dev/watchdog
watchdog-timeout = 15
EOF
fi

watchdog -F -c /configs/watchdog/watchdog.conf

