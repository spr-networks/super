#!/bin/bash
# Find a non-conflicting LAN subnet
# Checks the current uplink routes and selects an available subnet

# Get current subnet from dhcp.json if it exists, default to 192.168.2.0/24
SUBNET_BASE="192.168"
START_OCTET=2
CURRENT_SUBNET=""
if [ -f "configs/base/dhcp.json" ]; then
    CURRENT_SUBNET=$(jq -r '.TinyNets[0]' configs/base/dhcp.json 2>/dev/null)
    if [[ "$CURRENT_SUBNET" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)\.0/24$ ]]; then
        SUBNET_BASE="${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
        START_OCTET="${BASH_REMATCH[3]}"
    fi
fi

# Get current routes to check for conflicts
routes=$(ip route)

# Check if current subnet conflicts with uplink routes
check_conflict() {
    local i="$1"
    local escaped_base=$(echo "$SUBNET_BASE" | sed 's/\./\\./g')
    echo "$routes" | grep -q "${escaped_base}\.${i}\."
}

# If we have a current subnet, check if it conflicts
if [ -n "$CURRENT_SUBNET" ]; then
    if ! check_conflict "$START_OCTET"; then
        # Current subnet is fine, keep it
        SUBNET="$CURRENT_SUBNET"
        GATEWAY="${SUBNET_BASE}.${START_OCTET}.1"
        echo "Keeping existing LAN subnet: $SUBNET with gateway: $GATEWAY (no conflict)"
    fi
fi

# If no current subnet or it conflicts, find a new one
if [ -z "$SUBNET" ]; then
    for i in $(seq $START_OCTET 254); do
        if ! check_conflict "$i"; then
            # Found non-conflicting subnet
            SUBNET="${SUBNET_BASE}.${i}.0/24"
            GATEWAY="${SUBNET_BASE}.${i}.1"
            echo "Selected LAN subnet: $SUBNET with gateway: $GATEWAY"
            break
        fi
    done
fi

# Fallback to 192.168.2.0/24 if somehow we couldn't find anything
if [ -z "$SUBNET" ]; then
    SUBNET="192.168.2.0/24"
    GATEWAY="192.168.2.1"
    echo "Using fallback LAN subnet: $SUBNET with gateway: $GATEWAY"
fi

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
