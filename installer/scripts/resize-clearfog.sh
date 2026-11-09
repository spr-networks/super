#!/bin/bash
if [ "$UID" -ne 0 ]; then
    exec sudo "$0" "$@"
fi

# CVE-2026-109518: keep retries disabled, including before APT can upgrade itself.
install -m 0755 -d /etc/apt/apt.conf.d || exit 1
printf '%s\n' 'Acquire::Retries "0";' > /etc/apt/apt.conf.d/99-spr-security-retries || exit 1
apt-get -o Acquire::Retries=0 update || exit 1
apt-get -o Acquire::Retries=0 install -y --only-upgrade apt '?and(?installed,?source-package(^apt$))' || exit 1
apt-get -o Acquire::Retries=0 install -y --no-install-recommends qemu-utils cloud-guest-utils || exit 1

IMG="./data/spr.img"
qemu-img resize $IMG 10G
growpart $IMG 1

if [ ! -f $IMG ]; then
	echo "- missing image"
	exit
fi

losetup -Pf $IMG

export LOOP=$(losetup -j $IMG | cut -d: -f1)
export LOOP_ROOT="${LOOP}p1"

echo "+ loop is $LOOP"

e2fsck -pf $LOOP_ROOT
resize2fs $LOOP_ROOT

losetup -d $LOOP 2>/dev/null
