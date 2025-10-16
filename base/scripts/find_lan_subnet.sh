#!/bin/bash
# Find a non-conflicting LAN subnet
# Checks the current uplink routes and selects an available subnet

# Get current subnet from dhcp.json if it exists, default to 192.168.2.0/24
SUBNET_BASE="192.168"
START_OCTET=2
if [ -f "configs/base/dhcp.json" ]; then
    CURRENT_SUBNET=$(jq -r '.TinyNets[0]' configs/base/dhcp.json 2>/dev/null)
    if [[ "$CURRENT_SUBNET" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)\.0/24$ ]]; then
        SUBNET_BASE="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
        START_OCTET="${BASH_REMATCH[3]}"
    fi
fi

find_available_subnet() {
    # Get current routes to check for conflicts
    local routes=$(ip route)

    # Try subnets starting from the current dhcp.json value, then increment
    for i in $(seq $START_OCTET 254); do
        local subnet="${SUBNET_BASE}.${i}.0/24"
        local gateway="${SUBNET_BASE}.${i}.1"

        # Check if this subnet conflicts with existing routes
        local escaped_base=$(echo "$SUBNET_BASE" | sed 's/\./\\./g')
        if ! echo "$routes" | grep -q "${escaped_base}\.${i}\."; then
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
