#!/bin/sh
# One-shot script that installs SPR-provided SSH keys for the ubuntu user.
# Bind-mounted into a one-shot container by superd; reads keys from stdin.
# Refuses to overwrite an existing authorized_keys.
set -e
[ -e /host_ssh/authorized_keys ] && { echo "already exists" >&2; exit 3; }
cat > /host_ssh/authorized_keys
chown 1000:1000 /host_ssh /host_ssh/authorized_keys
chmod 700 /host_ssh
chmod 600 /host_ssh/authorized_keys
