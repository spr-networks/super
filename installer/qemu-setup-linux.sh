#!/bin/bash
set -e
# CVE-2026-109518: protect all subsequent host package operations.
printf '%s\n' 'Acquire::Retries "0";' | sudo tee /etc/apt/apt.conf.d/99-spr-security-retries >/dev/null
sudo apt-get -o Acquire::Retries=0 update --fix-missing #try to fix azure ubuntu issue
sudo apt-get -o Acquire::Retries=0 install -y --only-upgrade apt '?and(?installed,?source-package(^apt$))'
sudo apt-get -o Acquire::Retries=0 install -y zerofree
sudo apt-get -o Acquire::Retries=0 install -y qemu qemu-utils binfmt-support qemu-user-static # Install the qemu packages
# pinned in reproducible.env: it runs --privileged and registers the binfmt interpreters
QEMU_USER_STATIC_REF=$(sed -n 's/^QEMU_USER_STATIC_REF=//p' "$(dirname "$0")/../reproducible.env")
docker run --rm --privileged "${QEMU_USER_STATIC_REF:?QEMU_USER_STATIC_REF missing from reproducible.env}" --reset -p yes # This step will execute the registering scripts
sudo apt-get -o Acquire::Retries=0 install -y qemu-system-aarch64
sudo apt-get -o Acquire::Retries=0 install -y cloud-guest-utils

