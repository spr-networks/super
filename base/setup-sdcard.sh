#!/bin/bash

# constrain journal size
echo -e "[Journal]\n\nSystemMaxUse=50m\nSystemMaxFileSize=10M" > /etc/systemd/journald.conf
# mount logs as tmpfs
echo -e "tmpfs\t/tmp\ttmpfs\tdefaults,noatime,nosuid,size=100m\t0\t0\ntmpfs\t/var/tmp\ttmpfs\tdefaults,noatime,nosuid,size=512m\t0\t0\ntmpfs\t/var/log\ttmpfs\tdefaults,noatime,nosuid,mode=0755,size=100m\t0\t0\ntmpfs\t/run\ttmpfs\tdefaults,noatime,nosuid,mode=0755,size=10m\t0\t0\ntmpfs\t/var/run\ttmpfs\tdefaults,noatime,nosuid,mode=0755,size=10m\t0\t0\n" >> /etc/fstab

bash base/setup.sh
