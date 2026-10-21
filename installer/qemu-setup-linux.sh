#!/bin/bash
sudo apt-get update --fix-missing #try to fix azure ubuntu issue
sudo apt-get install -y zerofree
sudo apt-get install -y qemu qemu-utils binfmt-support qemu-user-static # Install the qemu packages
# pinned in reproducible.env: it runs --privileged and registers the binfmt interpreters
QEMU_USER_STATIC_REF=$(sed -n 's/^QEMU_USER_STATIC_REF=//p' "$(dirname "$0")/../reproducible.env")
docker run --rm --privileged "${QEMU_USER_STATIC_REF:?QEMU_USER_STATIC_REF missing from reproducible.env}" --reset -p yes # This step will execute the registering scripts
sudo apt-get install -y qemu-system-aarch64
sudo apt-get install -y cloud-guest-utils 

