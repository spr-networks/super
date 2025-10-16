#!/bin/bash
# Find a non-conflicting LAN subnet
# Checks the current uplink routes and selects an available 192.168.x.0/24 subnet

find_available_subnet() {
    # Get current routes to check for conflicts
    local routes=$(ip route)

    # Try subnets starting from 192.168.2.0/24, 192.168.3.0/24, etc.
    for i in {2..254}; do
        local subnet="192.168.${i}.0/24"
        local gateway="192.168.${i}.1"

        # Check if this subnet conflicts with existing routes
        # Look for any route that starts with 192.168.x.
        if ! echo "$routes" | grep -q "192\.168\.${i}\."; then
            # Found non-conflicting subnet
            echo "$subnet|$gateway"
            return 0
        fi
    done

    # Fallback to 192.168.2.0/24 if somehow we checked everything
    echo "192.168.2.0/24|192.168.2.1"
    return 1
}

# Get available subnet and gateway
result=$(find_available_subnet)
SUBNET=$(echo "$result" | cut -d'|' -f1)
GATEWAY=$(echo "$result" | cut -d'|' -f2)

echo "Selected LAN subnet: $SUBNET with gateway: $GATEWAY"

# Update dhcp.json
if [ -f "configs/base/dhcp.json" ]; then
    jq --arg subnet "$SUBNET" '.TinyNets = [$subnet]' configs/base/dhcp.json > configs/base/dhcp.json.tmp
    mv configs/base/dhcp.json.tmp configs/base/dhcp.json
    echo "Updated configs/base/dhcp.json with subnet $SUBNET"
fi

# Update lanip
if [ -f "configs/base/lanip" ]; then
    echo "$GATEWAY" > configs/base/lanip
    echo "Updated configs/base/lanip with gateway $GATEWAY"
fi
