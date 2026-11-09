#!/bin/bash
set -e
# install upstream docker
# CVE-2026-109518: keep retries disabled, including before APT can upgrade itself.
install -m 0755 -d /etc/apt/apt.conf.d
printf '%s\n' 'Acquire::Retries "0";' > /etc/apt/apt.conf.d/99-spr-security-retries
apt-get -o Acquire::Retries=0 update
apt-get -o Acquire::Retries=0 install -y --only-upgrade apt '?and(?installed,?source-package(^apt$))'
# Debian's fixed versions must be present in the resulting image. Ubuntu
# uses its own security versions; keep the retry workaround enabled there.
. /etc/os-release
case "$ID:${VERSION_CODENAME:-}" in
  debian:trixie|raspbian:trixie) apt_minimum=3.0.4 ;;
  debian:bookworm|raspbian:bookworm) apt_minimum=2.6.2 ;;
  *) apt_minimum= ;;
esac
if [ -n "$apt_minimum" ]; then
  apt_security_packages=$(dpkg-query -W -f='${source:Package} ${binary:Package} ${Version} ${db:Status-Status}\n') || exit 1
  while read -r apt_source apt_package apt_version apt_status; do
    [ "$apt_source" = apt ] && [ "$apt_status" = installed ] || continue
    if ! dpkg --compare-versions "$apt_version" ge "$apt_minimum"; then
      echo "$apt_package $apt_version is older than the required security version $apt_minimum" >&2
      exit 1
    fi
  done <<< "$apt_security_packages"
fi

apt-get -o Acquire::Retries=0 -y install --no-install-recommends ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt -o Acquire::Retries=0 update
apt-get -o Acquire::Retries=0 -y install --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin



