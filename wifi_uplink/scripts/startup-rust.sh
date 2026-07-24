#!/bin/bash
set -euo pipefail

CONFIG=${BARELY_CLI_CONFIG:-/configs/wifi_uplink/wpa.json}
STATE=/state/wifi_uplink
CLIENTS=()

mkdir -p "$STATE"
rm -f "$STATE"/status.*

cleanup() {
  trap - EXIT INT TERM
  for pid in "${CLIENTS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  for pid in "${CLIENTS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
  rm -f "$STATE"/status.*
}
trap cleanup EXIT INT TERM

valid_iface() {
  local iface=$1
  [ "${#iface}" -le 15 ] &&
    [[ "$iface" =~ ^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9][A-Za-z0-9-]*)*$ ]]
}

start_iface() {
  local logical=$1
  local scan=$2
  local monitor=$3
  local mac
  local scan_phy
  local monitor_phy

  if ! valid_iface "$logical" ||
     ! valid_iface "$scan" ||
     ! valid_iface "$monitor" ||
     [ "$logical" = "$scan" ] ||
     [ "$logical" = "$monitor" ] ||
     [ "$scan" = "$monitor" ]; then
    echo "wifi uplink: invalid or non-distinct interface mapping for $logical" >&2
    return 1
  fi

  if [ ! -e "/sys/class/net/$scan/phy80211" ]; then
    echo "wifi uplink: scan interface $scan is not a provisioned wireless interface" >&2
    return 1
  fi
  if [ ! -e "/sys/class/net/$monitor/phy80211" ]; then
    echo "wifi uplink: monitor interface $monitor is not a provisioned wireless interface" >&2
    return 1
  fi
  if [ "$(cat "/sys/class/net/$scan/type")" != "1" ]; then
    echo "wifi uplink: scan interface $scan is not in managed mode" >&2
    return 1
  fi
  if [ "$(cat "/sys/class/net/$monitor/type")" != "803" ]; then
    echo "wifi uplink: monitor interface $monitor is not in monitor mode" >&2
    return 1
  fi

  scan_phy=$(readlink -f "/sys/class/net/$scan/phy80211")
  monitor_phy=$(readlink -f "/sys/class/net/$monitor/phy80211")
  if [ "$scan_phy" != "$monitor_phy" ]; then
    echo "wifi uplink: $scan and $monitor are not on the same radio" >&2
    return 1
  fi

  if [ -e "/sys/class/net/$logical/phy80211" ]; then
    echo "wifi uplink: $logical is still a wireless interface; the system must leave that name available for the TAP" >&2
    return 1
  fi
  if [ -e "/sys/class/net/$logical" ] &&
     [ ! -e "/sys/class/net/$logical/tun_flags" ]; then
    echo "wifi uplink: $logical already exists and is not a TAP interface" >&2
    return 1
  fi

  mac=$(cat "/sys/class/net/$scan/address")
  if [[ ! "$mac" =~ ^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$ ]]; then
    echo "wifi uplink: scan interface $scan has an invalid MAC address" >&2
    return 1
  fi

  /usr/local/sbin/barely-cli \
    --spr-config "$CONFIG" \
    --spr-iface "$logical" \
    --scan-iface "$scan" \
    --mode iface \
    --iface "$monitor" \
    --mac "$mac" \
    --tap "$logical" \
    --state-file "$STATE/status.$logical" &
  CLIENTS+=("$!")
}

if [ -f "$CONFIG" ]; then
  while IFS= read -r entry; do
    logical=$(jq -r '.Iface // ""' <<<"$entry")
    scan=$(jq -r '.ScanIface // ""' <<<"$entry")
    monitor=$(jq -r '.MonitorIface // ""' <<<"$entry")
    start_iface "$logical" "$scan" "$monitor"
  done < <(
    jq -c '
      .WPAs[]
      | select(.Enabled == true)
    ' "$CONFIG"
  )
fi

if [ "${#CLIENTS[@]}" -eq 0 ]; then
  echo "wifi uplink: Rust mode has no enabled, fully provisioned interfaces" >&2
  exit 1
fi

wait -n "${CLIENTS[@]}"
