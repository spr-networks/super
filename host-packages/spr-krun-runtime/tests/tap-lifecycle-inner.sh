#!/bin/bash
set -euxo pipefail

DEB="$1"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends build-essential jq util-linux "$DEB"

cc -shared -fPIC -Wl,-soname,libkrun.so.1 \
    -o /tmp/libkrun.so.1 /tests/fake-libkrun.c
real_libkrun="$(readlink -f /usr/lib/spr-krun-runtime/libkrun.so.1)"
install -m 0755 /tmp/libkrun.so.1 "$real_libkrun"
ln -sf /dev/null /dev/kvm

runtime=/usr/libexec/spr-krun-runtime/krun
state=/run/spr-krun-lifecycle-test
token=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
tap=ktest0

install -d -m 0700 /var/lib/spr-krun/policies
printf '%s\n' \
    "{\"tap_name\":\"$tap\",\"net_mac\":\"02:00:00:00:00:01\",\"vsock_path\":\"/run/spr-krun/listen/socket.sock\",\"vsock_port\":4040}" \
    > "/var/lib/spr-krun/policies/$token.json"
chmod 0600 "/var/lib/spr-krun/policies/$token.json"

make_bundle() {
    local bundle="$1"
    install -d "$bundle/rootfs/dev" "$bundle/rootfs/proc" \
        "$bundle/rootfs/sys" "$bundle/rootfs/tmp"
    (
        cd "$bundle"
        "$runtime" spec
    )
    jq --arg token "$token" '
        .annotations["run.oci.spr.krun.policy"] = $token |
        .process.args = ["/bin/true"] |
        .process.terminal = false |
        .mounts += [{
            "destination": "/run/spr-krun/listen",
            "type": "bind",
            "source": "/run/spr-krun/listen",
            "options": ["rbind", "rw", "nosuid", "nodev", "noexec"]
        }]
    ' "$bundle/config.json" > "$bundle/config.json.new"
    mv "$bundle/config.json.new" "$bundle/config.json"
}

assert_tap() {
    local pid="$1"

    # The fake backend enters its 30-second sleep only after receiving the
    # expected TAP name, MAC, and DHCP-client flag from krun_add_net_tap.
    sleep 1
    kill -0 "$pid"
    test "$(cat "/proc/$pid/root/sys/class/net/$tap/ifalias")" = \
        spr-krun-runtime
    nsenter -t "$pid" -n ip -j link show dev "$tap" |
        jq -e '.[0].master == "krunbr0"'
    nsenter -t "$pid" -n ip -j link show dev eth0 |
        jq -e '.[0].master == "krunbr0"'
    nsenter -t "$pid" -n ip -j addr show dev eth0 |
        jq -e '[.[0].addr_info[]?] | length == 0'
    nsenter -t "$pid" -n ip -j link show dev krunbr0 |
        jq -e '.[0].operstate == "UP"'
}

# Split create/start: attach the uplink only after create. This proves start
# reloads policy instead of depending on the create-child cookie.
make_bundle /tmp/split
"$runtime" --root "$state" create --bundle /tmp/split split-test
split_pid="$("$runtime" --root "$state" state split-test | jq -r .pid)"
ip link add split-host type veth peer name eth0 netns "$split_pid"
ip link set split-host up
nsenter -t "$split_pid" -n ip addr add 192.0.2.2/24 dev eth0
nsenter -t "$split_pid" -n ip link set eth0 up
"$runtime" --root "$state" start split-test
assert_tap "$split_pid"
"$runtime" --root "$state" delete --force split-test
ip link del split-host 2>/dev/null || true
# The fake backend intentionally has no pathname cleanup. A forced deletion
# therefore leaves the listener behind for the next lifecycle to reclaim.
test -S /run/spr-krun/listen/socket.sock

# Ambiguous namespaces fail closed instead of allowing policy to select or the
# runtime to guess which attached interface should be destroyed and bridged.
make_bundle /tmp/ambiguous
"$runtime" --root "$state" create --bundle /tmp/ambiguous ambiguous-test
ambiguous_pid="$("$runtime" --root "$state" state ambiguous-test | jq -r .pid)"
ip link add ambiguous-host0 type veth peer name eth0 netns "$ambiguous_pid"
ip link add ambiguous-host1 type veth peer name eth1 netns "$ambiguous_pid"
if ambiguous_error="$("$runtime" --root "$state" start ambiguous-test 2>&1)"; then
    echo "krun accepted an ambiguous plugin uplink" >&2
    exit 1
fi
grep -F 'exactly one veth uplink (found 2)' <<< "$ambiguous_error"
if nsenter -t "$ambiguous_pid" -n ip link show dev "$tap"; then
    echo "krun created a TAP before rejecting ambiguous uplinks" >&2
    exit 1
fi
"$runtime" --root "$state" delete --force ambiguous-test
ip link del ambiguous-host0 2>/dev/null || true
ip link del ambiguous-host1 2>/dev/null || true

# Direct run: the parent hook runs while the child is synchronized.
test -S /run/spr-krun/listen/socket.sock
ip netns add direct-test
ip link add direct-host type veth peer name eth0 netns direct-test
ip link set direct-host up
ip netns exec direct-test ip addr add 192.0.2.2/24 dev eth0
ip netns exec direct-test ip link set eth0 up
make_bundle /tmp/direct
jq '
    (.linux.namespaces[] | select(.type == "network")).path =
        "/run/netns/direct-test"
' /tmp/direct/config.json > /tmp/direct/config.json.new
mv /tmp/direct/config.json.new /tmp/direct/config.json
"$runtime" --root "$state" run --detach --bundle /tmp/direct direct-test
direct_pid="$("$runtime" --root "$state" state direct-test | jq -r .pid)"
test -S /run/spr-krun/listen/socket.sock
assert_tap "$direct_pid"
"$runtime" --root "$state" delete --force direct-test
ip netns del direct-test

echo "TAP lifecycle tests passed"
