#!/bin/bash
set -euo pipefail

DEB="${1:-}"
if [ -z "$DEB" ] || [ ! -f "$DEB" ]; then
    echo "usage: $0 path/to/spr-krun-runtime_arm64.deb" >&2
    exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEB_DIR="$(cd -- "$(dirname -- "$DEB")" && pwd)"
DEB_NAME="$(basename -- "$DEB")"

docker run --rm --privileged --platform linux/arm64 \
    --security-opt apparmor=unconfined \
    -v "$DEB_DIR:/packages:ro" \
    -v "$SCRIPT_DIR/tests:/tests:ro" \
    debian:trixie /tests/tap-lifecycle-inner.sh "/packages/$DEB_NAME"
