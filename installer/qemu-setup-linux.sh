#!/bin/bash
set -e
sudo apt-get update
sudo apt-get install -y --only-upgrade apt '?and(?installed,?source-package(^apt$))'
sudo apt-get install -y zerofree
# qemu-system-arm provides qemu-system-aarch64 on current Ubuntu runners.
sudo apt-get install -y qemu-system-arm qemu-utils binfmt-support qemu-user-static
# pinned in reproducible.env: it runs --privileged and registers the binfmt interpreters
QEMU_USER_STATIC_REF=$(sed -n 's/^QEMU_USER_STATIC_REF=//p' "$(dirname "$0")/../reproducible.env")
docker run --rm --privileged "${QEMU_USER_STATIC_REF:?QEMU_USER_STATIC_REF missing from reproducible.env}" --reset -p yes # This step will execute the registering scripts
sudo apt-get install -y cloud-guest-utils

