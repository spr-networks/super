#!/bin/bash

echo "=== WireGuard Direct Interface Test Suite ==="
echo

# Check environment
echo "Environment checks:"
if command -v wg >/dev/null 2>&1; then
    echo "✓ wg command found"
else
    echo "✗ wg command not found (exec fallback will fail)"
fi

if [ -e "/sys/class/net/wg0" ]; then
    echo "✓ WireGuard interface wg0 exists"
else
    echo "✗ WireGuard interface wg0 does not exist"
fi

echo
echo "Running unit tests (no WireGuard required):"
go test -v -run "Unit|Wrapper|Serialization|Direct|Fallback|Environment" | grep -E "(PASS|FAIL|---)"

echo
echo "Running integration tests (requires WireGuard):"
go test -v -run "TestWireGuardCtrl|TestCompatibility|TestGetStatus" 2>&1 | grep -E "(PASS|FAIL|Skip|---)"

echo
echo "Test Summary:"
go test ./... 2>&1 | tail -n 5