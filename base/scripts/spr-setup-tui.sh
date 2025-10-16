#!/bin/bash
# SPR Setup TUI - nmtui-style interface for configuring SPR
# Configures config.sh, dhcp.json, lanip, and initial admin password

# Check if dialog is available, fall back to whiptail
if command -v dialog &> /dev/null; then
    DIALOG="dialog"
elif command -v whiptail &> /dev/null; then
    DIALOG="whiptail"
else
    echo "Error: Neither dialog nor whiptail is installed"
    echo "Install with: apt-get install dialog"
    exit 1
fi

# Find the super directory
# First try current directory, then script's parent directory
find_super_dir() {
    # Check if current directory has the expected structure
    if [ -d "base/template_configs" ]; then
        echo "$PWD"
        return 0
    fi

    # Get script directory and go up to find super
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    # Script is in base/scripts, so go up two levels
    local super_candidate="$(cd "$script_dir/../.." && pwd)"
    if [ -d "$super_candidate/base/template_configs" ]; then
        echo "$super_candidate"
        return 0
    fi

    # Fallback to /home/spr/super
    if [ -d "/home/spr/super/base/template_configs" ]; then
        echo "/home/spr/super"
        return 0
    fi

    echo "Error: Cannot find SPR super directory" >&2
    exit 1
}

SUPERDIR=$(find_super_dir)

# Copy template configs if configs directory doesn't exist
if [ ! -d "${SUPERDIR}/configs" ]; then
    echo "Initializing configuration from templates..."
    cp -R "${SUPERDIR}/base/template_configs" "${SUPERDIR}/configs"
fi

# Configuration paths
CONFIG_DIR="${SUPERDIR}/configs/base"
CONFIG_SH="${CONFIG_DIR}/config.sh"
DHCP_JSON="${CONFIG_DIR}/dhcp.json"
LANIP_FILE="${CONFIG_DIR}/lanip"
AUTH_USERS="${SUPERDIR}/configs/api/auth_users.json"
API_JSON="${CONFIG_DIR}/api.json"

# Temporary file for dialog output
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

# Colors for dialog
export DIALOGRC=/dev/null

# Get list of network interfaces (excluding loopback, docker, virtual)
get_interfaces() {
    ip -o link show | awk -F': ' '{print $2}' | grep -v '^lo$' | grep -v '^docker' | grep -v '^veth' | grep -v '^sprloop'
}

# Get current value from config.sh
get_config_value() {
    local var="$1"
    if [ -f "$CONFIG_SH" ]; then
        grep "^${var}=" "$CONFIG_SH" | cut -d'=' -f2 | tr -d '"' | tr -d "'"
    fi
}

# Get current subnet from dhcp.json
get_current_subnet() {
    if [ -f "$DHCP_JSON" ]; then
        jq -r '.TinyNets[0] // "192.168.2.0/24"' "$DHCP_JSON" 2>/dev/null || echo "192.168.2.0/24"
    else
        echo "192.168.2.0/24"
    fi
}

# Get current LAN IP
get_current_lanip() {
    if [ -f "$LANIP_FILE" ]; then
        cat "$LANIP_FILE" 2>/dev/null || echo "192.168.2.1"
    else
        echo "192.168.2.1"
    fi
}

# Get PLUS token from api.json
get_plus_token() {
    if [ -f "$API_JSON" ]; then
        jq -r '.PlusToken // ""' "$API_JSON" 2>/dev/null || echo ""
    else
        echo ""
    fi
}

# Main menu
main_menu() {
    while true; do
        $DIALOG --clear --title "SPR Setup" \
            --menu "Configure your SPR installation\n\nUse arrow keys to navigate, Enter to select:" 24 70 9 \
            "1" "Network Settings (Uplink & LAN)" \
            "2" "WiFi Configuration" \
            "3" "Admin Password" \
            "4" "PLUS Token" \
            "5" "Advanced Settings" \
            "6" "Switch to Virtual Mode (VPN-only)" \
            "7" "View Current Configuration" \
            "8" "Save and Exit" \
            "9" "Exit without Saving" \
            2>$TMPFILE

        choice=$?
        if [ $choice -ne 0 ]; then
            confirm_exit
            return
        fi

        selected=$(cat $TMPFILE)
        case "$selected" in
            1) network_settings ;;
            2) wifi_settings ;;
            3) admin_password ;;
            4) plus_token ;;
            5) advanced_settings ;;
            6) virtual_mode ;;
            7) view_config ;;
            8) save_and_exit ;;
            9) confirm_exit; return ;;
        esac
    done
}

# Network settings menu
network_settings() {
    # Get current values
    local current_wanif=$(get_config_value "WANIF")
    local current_lanif=$(get_config_value "LANIF")
    local current_subnet=$(get_current_subnet)
    local current_gateway=$(get_current_lanip)

    # Get available interfaces
    local interfaces=($(get_interfaces))

    # Build interface list for dialog
    local iface_list=()
    for iface in "${interfaces[@]}"; do
        if [ "$iface" = "$current_wanif" ]; then
            iface_list+=("$iface" "WAN (current)")
        else
            iface_list+=("$iface" "")
        fi
    done

    # Select WAN interface
    $DIALOG --clear --title "Network Settings" \
        --menu "Select Uplink/WAN Interface (Internet connection):" \
        20 70 10 "${iface_list[@]}" 2>$TMPFILE

    if [ $? -eq 0 ]; then
        WANIF=$(cat $TMPFILE)
    else
        return
    fi

    # Ask about LAN interface
    $DIALOG --clear --title "Network Settings" \
        --yesno "Do you have a second ethernet port for wired LAN?\n\nSelect Yes if you want to use a dedicated LAN port.\nSelect No to use WiFi only for LAN." \
        10 70

    if [ $? -eq 0 ]; then
        # Build LAN interface list (exclude selected WAN)
        local lan_iface_list=()
        for iface in "${interfaces[@]}"; do
            if [ "$iface" != "$WANIF" ]; then
                if [ "$iface" = "$current_lanif" ]; then
                    lan_iface_list+=("$iface" "LAN (current)")
                else
                    lan_iface_list+=("$iface" "")
                fi
            fi
        done

        $DIALOG --clear --title "Network Settings" \
            --menu "Select LAN Interface:" \
            20 70 10 "${lan_iface_list[@]}" 2>$TMPFILE

        if [ $? -eq 0 ]; then
            LANIF=$(cat $TMPFILE)
        fi
    else
        LANIF=""
    fi

    # Configure LAN subnet
    $DIALOG --clear --title "Network Settings" \
        --inputbox "Enter Private Network Subnet (CIDR notation):\n\nExample: 192.168.2.0/24, 10.0.0.0/24" \
        12 70 "$current_subnet" 2>$TMPFILE

    if [ $? -eq 0 ]; then
        TINYNET=$(cat $TMPFILE)
        # Validate subnet format
        if ! [[ "$TINYNET" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ ]]; then
            $DIALOG --clear --title "Error" \
                --msgbox "Invalid subnet format. Please use CIDR notation (e.g., 192.168.2.0/24)" 8 60
            return
        fi

        # Extract gateway from subnet
        local subnet_base=$(echo "$TINYNET" | cut -d'/' -f1 | cut -d'.' -f1-3)
        GATEWAY="${subnet_base}.1"
    else
        return
    fi

    # Show summary
    local lan_text="WiFi only"
    if [ -n "$LANIF" ]; then
        lan_text="$LANIF"
    fi

    $DIALOG --clear --title "Network Settings Summary" \
        --msgbox "Network Configuration:\n\n\
WAN Interface: $WANIF\n\
LAN Interface: $lan_text\n\
LAN Subnet: $TINYNET\n\
LAN Gateway: $GATEWAY" 12 60
}

# WiFi settings
wifi_settings() {
    # Check if any WiFi interfaces exist
    local wifi_ifaces=$(ls /sys/class/net/ 2>/dev/null | grep '^wlan' || true)

    if [ -z "$wifi_ifaces" ]; then
        $DIALOG --clear --title "WiFi Configuration" \
            --msgbox "No WiFi interfaces detected.\n\nWiFi configuration requires wireless network adapters." 9 60
        return
    fi

    local wifi_count=$(echo "$wifi_ifaces" | wc -l)

    # Get current SSID if set
    local current_ssid=""
    local current_country=""

    if [ -n "$WIFI_SSID" ]; then
        current_ssid="$WIFI_SSID"
    else
        current_ssid="SPRNet"
    fi

    if [ -n "$WIFI_COUNTRY" ]; then
        current_country="$WIFI_COUNTRY"
    else
        current_country="US"
    fi

    # Configure SSID
    $DIALOG --clear --title "WiFi Configuration" \
        --inputbox "Enter WiFi Network Name (SSID):\n\nThis will be used for all WiFi interfaces ($wifi_count detected)\n\nSSID:" \
        13 70 "$current_ssid" 2>$TMPFILE

    if [ $? -ne 0 ]; then
        return
    fi

    local new_ssid=$(cat $TMPFILE)

    # Validate SSID
    if [ -z "$new_ssid" ] || [ ${#new_ssid} -lt 2 ] || [ ${#new_ssid} -gt 32 ]; then
        $DIALOG --clear --title "Error" \
            --msgbox "SSID must be between 2 and 32 characters" 7 50
        return
    fi

    # Configure country code
    $DIALOG --clear --title "WiFi Country Code" \
        --inputbox "Enter WiFi Country Code (2 letters):\n\nExamples: US, GB, DE, FR, JP\n\nCountry Code:" \
        11 70 "$current_country" 2>$TMPFILE

    if [ $? -ne 0 ]; then
        return
    fi

    local new_country=$(cat $TMPFILE)

    # Validate country code
    if ! [[ "$new_country" =~ ^[A-Z]{2}$ ]]; then
        $DIALOG --clear --title "Error" \
            --msgbox "Country code must be 2 uppercase letters (e.g., US, GB)" 7 60
        return
    fi

    # Configure first device WiFi password
    while true; do
        $DIALOG --clear --title "WiFi Password - First Device" \
            --passwordbox "Enter WiFi Password for first device:\n\nThis sets the default password that your first device\nwill use to connect. You can add more devices with\ndifferent passwords later through the web interface.\n\nPassword (8+ characters):" \
            14 70 2>$TMPFILE

        if [ $? -ne 0 ]; then
            return
        fi

        local wifi_pass=$(cat $TMPFILE)

        if [ ${#wifi_pass} -lt 8 ]; then
            $DIALOG --clear --title "Error" \
                --msgbox "WiFi password must be at least 8 characters" 7 50
            continue
        fi

        $DIALOG --clear --title "WiFi Password - First Device" \
            --passwordbox "Confirm WiFi Password:" \
            10 70 2>$TMPFILE

        if [ $? -ne 0 ]; then
            return
        fi

        local wifi_pass2=$(cat $TMPFILE)

        if [ "$wifi_pass" != "$wifi_pass2" ]; then
            $DIALOG --clear --title "Error" \
                --msgbox "Passwords do not match. Please try again." 7 50
            continue
        fi

        WIFI_PASSWORD="$wifi_pass"
        break
    done

    WIFI_SSID="$new_ssid"
    WIFI_COUNTRY="$new_country"

    # Show summary
    $DIALOG --clear --title "WiFi Configuration Summary" \
        --msgbox "WiFi Configuration:\n\n\
SSID: $WIFI_SSID\n\
Country: $WIFI_COUNTRY\n\
Password: Set (for first device)\n\
Interfaces: $wifi_count WiFi adapter(s) detected\n\n\
Channels will be auto-selected for optimal performance." 14 60
}

# Admin password configuration
admin_password() {
    while true; do
        $DIALOG --clear --title "Admin Password" \
            --passwordbox "Enter Admin Password (minimum 5 characters):" \
            10 60 2>$TMPFILE

        if [ $? -ne 0 ]; then
            return
        fi

        local pass1=$(cat $TMPFILE)

        if [ ${#pass1} -lt 5 ]; then
            $DIALOG --clear --title "Error" \
                --msgbox "Password must be at least 5 characters long" 7 50
            continue
        fi

        $DIALOG --clear --title "Admin Password" \
            --passwordbox "Confirm Admin Password:" \
            10 60 2>$TMPFILE

        if [ $? -ne 0 ]; then
            return
        fi

        local pass2=$(cat $TMPFILE)

        if [ "$pass1" != "$pass2" ]; then
            $DIALOG --clear --title "Error" \
                --msgbox "Passwords do not match. Please try again." 7 50
            continue
        fi

        ADMIN_PASSWORD="$pass1"
        $DIALOG --clear --title "Success" \
            --msgbox "Admin password set successfully" 7 50
        break
    done
}

# PLUS token configuration
plus_token() {
    local current_token=$(get_plus_token)
    local display_token=""

    if [ -n "$current_token" ]; then
        # Show only first 8 chars for security
        display_token="${current_token:0:8}..."
    fi

    $DIALOG --clear --title "SPR PLUS Token" \
        --msgbox "SPR PLUS provides access to:\n\n\
  - Mesh networking features\n\
  - Advanced plugins\n\
  - Priority support\n\n\
Get your PLUS token at:\nhttps://www.supernetworks.org/pages/plus\n\n\
Current token: ${display_token:-Not set}" 16 70

    $DIALOG --clear --title "PLUS Token" \
        --inputbox "Enter your PLUS Token (leave empty to clear):" \
        10 70 "$current_token" 2>$TMPFILE

    if [ $? -eq 0 ]; then
        local new_token=$(cat $TMPFILE)
        PLUS_TOKEN="$new_token"

        if [ -n "$new_token" ]; then
            $DIALOG --clear --title "Success" \
                --msgbox "PLUS token configured successfully" 7 50
        else
            $DIALOG --clear --title "Success" \
                --msgbox "PLUS token cleared" 7 50
        fi
    fi
}

# Virtual mode setup
virtual_mode() {
    $DIALOG --clear --title "Virtual Mode - VPN Gateway Only" \
        --yesno "Virtual Mode is designed for VPN-only deployments.\n\n\
This mode is for:\n\
  - VPN gateway service only\n\
  - No WiFi or LAN clients\n\
  - WireGuard/VPN connections only\n\n\
This will switch to the virtual installation script.\n\n\
Do you want to continue with Virtual Mode setup?" 18 70

    if [ $? -eq 0 ]; then
        # Check if virtual_install.sh exists
        if [ -x "${SUPERDIR}/virtual_install.sh" ]; then
            clear
            echo "Switching to Virtual Mode installation..."
            exec "${SUPERDIR}/virtual_install.sh"
        else
            $DIALOG --clear --title "Error" \
                --msgbox "Virtual install script not found at:\n${SUPERDIR}/virtual_install.sh" 8 70
        fi
    fi
}

# Advanced settings
advanced_settings() {
    # Get current values
    local upstream_enabled=$(get_config_value "UPSTREAM_SERVICES_ENABLE")
    local wg_port=$(get_config_value "WIREGUARD_PORT")
    local hostname=""

    [ "$upstream_enabled" = "1" ] && local upstream_status="ON" || local upstream_status="OFF"
    [ -z "$wg_port" ] && wg_port="51280"

    # Get current hostname
    if [ -f "${SUPERDIR}/configs/base/hostname" ]; then
        hostname=$(cat "${SUPERDIR}/configs/base/hostname" 2>/dev/null || echo "spr")
    else
        hostname="${HOSTNAME:-spr}"
    fi

    while true; do
        $DIALOG --clear --title "Advanced Settings" \
            --menu "Select setting to configure:" 16 70 8 \
            "1" "Upstream Services (SSH/API from WAN): $upstream_status" \
            "2" "WireGuard Port: $wg_port" \
            "3" "Hostname: $hostname" \
            "4" "Back to Main Menu" \
            2>$TMPFILE

        choice=$?
        if [ $choice -ne 0 ] || [ "$(cat $TMPFILE)" = "4" ]; then
            return
        fi

        case $(cat $TMPFILE) in
            1)
                if [ "$upstream_status" = "ON" ]; then
                    UPSTREAM_SERVICES_ENABLE=""
                    upstream_status="OFF"
                else
                    UPSTREAM_SERVICES_ENABLE="1"
                    upstream_status="ON"
                fi
                ;;
            2)
                $DIALOG --clear --title "WireGuard Port" \
                    --inputbox "Enter WireGuard Port:" 10 50 "$wg_port" 2>$TMPFILE
                if [ $? -eq 0 ]; then
                    local new_port=$(cat $TMPFILE)
                    if [[ "$new_port" =~ ^[0-9]+$ ]] && [ "$new_port" -ge 1024 ] && [ "$new_port" -le 65535 ]; then
                        wg_port="$new_port"
                        WIREGUARD_PORT="$wg_port"
                    else
                        $DIALOG --clear --title "Error" \
                            --msgbox "Invalid port number. Use 1024-65535" 7 50
                    fi
                fi
                ;;
            3)
                $DIALOG --clear --title "Hostname" \
                    --inputbox "Enter device hostname:\n\nThis is how the device identifies itself on the network.\n\nHostname:" \
                    12 70 "$hostname" 2>$TMPFILE
                if [ $? -eq 0 ]; then
                    local new_hostname=$(cat $TMPFILE)
                    # Validate hostname
                    if [[ "$new_hostname" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$ ]]; then
                        hostname="$new_hostname"
                        HOSTNAME_CONFIG="$hostname"
                    else
                        $DIALOG --clear --title "Error" \
                            --msgbox "Invalid hostname. Use only letters, numbers, and hyphens.\nMust start and end with letter or number." 8 60
                    fi
                fi
                ;;
        esac
    done
}

# View current configuration
view_config() {
    local wanif=$(get_config_value "WANIF")
    local lanif=$(get_config_value "LANIF")
    local subnet=$(get_current_subnet)
    local gateway=$(get_current_lanip)
    local upstream=$(get_config_value "UPSTREAM_SERVICES_ENABLE")
    local wg_port=$(get_config_value "WIREGUARD_PORT")
    local plus_token=$(get_plus_token)
    local plus_display=""
    local wifi_ssid_display="Not configured"
    local wifi_country_display="Not configured"
    local hostname_display="Not configured"

    [ -z "$wanif" ] && wanif="Not configured"
    [ -z "$lanif" ] && lanif="Not configured (WiFi only)"
    [ "$upstream" = "1" ] && upstream="Enabled" || upstream="Disabled"
    [ -z "$wg_port" ] && wg_port="51280 (default)"
    if [ -n "$plus_token" ]; then
        plus_display="${plus_token:0:8}..."
    else
        plus_display="Not configured"
    fi
    [ -n "$WIFI_SSID" ] && wifi_ssid_display="$WIFI_SSID"
    [ -n "$WIFI_COUNTRY" ] && wifi_country_display="$WIFI_COUNTRY"
    [ -n "$HOSTNAME_CONFIG" ] && hostname_display="$HOSTNAME_CONFIG"

    $DIALOG --clear --title "Current Configuration" \
        --msgbox "Current SPR Configuration:\n\n\
WAN Interface: $wanif\n\
LAN Interface: $lanif\n\
LAN Subnet: $subnet\n\
LAN Gateway: $gateway\n\n\
WiFi:\n\
  SSID: $wifi_ssid_display\n\
  Country: $wifi_country_display\n\n\
PLUS:\n\
  Token: $plus_display\n\n\
Advanced:\n\
  Hostname: $hostname_display\n\
  Upstream Services: $upstream\n\
  WireGuard Port: $wg_port" 24 65
}

# Save configuration
save_and_exit() {
    # Validate required settings
    if [ -z "$WANIF" ]; then
        $DIALOG --clear --title "Error" \
            --msgbox "WAN interface must be configured before saving" 7 50
        return
    fi

    if [ -z "$TINYNET" ]; then
        $DIALOG --clear --title "Error" \
            --msgbox "LAN subnet must be configured before saving" 7 50
        return
    fi

    $DIALOG --clear --title "Save Configuration" \
        --yesno "Save configuration and apply changes?" 7 50

    if [ $? -eq 0 ]; then
        write_config

        # Ask if user wants to restart SPR
        $DIALOG --clear --title "Configuration Saved" \
            --yesno "Configuration saved successfully!\n\nDo you want to restart SPR services now?\n\nThis will apply your changes immediately." 11 60

        if [ $? -eq 0 ]; then
            clear
            echo "Restarting SPR services..."
            cd "$SUPERDIR"
            if command -v docker &> /dev/null; then
                docker compose restart
            else
                echo "Docker not found. Please restart SPR manually."
            fi
            echo ""
            echo "Press Enter to exit..."
            read
        fi
        exit 0
    fi
}

# Write configuration files
write_config() {
    # Ensure config directory exists
    mkdir -p "$CONFIG_DIR"

    # Write config.sh
    cat > "$CONFIG_SH" <<EOF
#!/bin/sh

# comment below to DISABLE ssh, API from the Upstream Interface
${UPSTREAM_SERVICES_ENABLE:+UPSTREAM_SERVICES_ENABLE=1}

# Uncomment below to use SPR without wifi,
#  as a VPN gateway for example
#VIRTUAL_SPR=1

WANIF=${WANIF}
RUN_WAN_DHCP=true
RUN_WAN_DHCP_IPV=4
${LANIF:+LANIF=$LANIF}

DOCKERNET=172.17.0.0/16
DOCKERIF=docker0

WIREGUARD_PORT=${WIREGUARD_PORT:-51280}
EOF

    chmod +x "$CONFIG_SH"

    # Write dhcp.json - update or create
    if [ -f "$DHCP_JSON" ]; then
        # Update existing dhcp.json, preserving other settings
        jq --arg subnet "$TINYNET" '.TinyNets = [$subnet]' "$DHCP_JSON" > "${DHCP_JSON}.tmp"
        mv "${DHCP_JSON}.tmp" "$DHCP_JSON"
    else
        # Create new dhcp.json
        jq -n --arg subnet "$TINYNET" '{TinyNets: [$subnet], LeaseTime: "24h0m0s"}' > "$DHCP_JSON"
    fi

    # Write lanip
    echo "$GATEWAY" > "$LANIP_FILE"

    # Update interfaces.json for WAN and LAN interfaces
    local interfaces_json="${CONFIG_DIR}/interfaces.json"

    # Update or create interfaces.json with WAN and LAN configuration
    if [ -f "$interfaces_json" ] && [ -s "$interfaces_json" ]; then
        # File exists - update WAN and LAN entries while preserving other fields
        local temp_json=$(mktemp)

        # Update WANIF to Type: Uplink, Enabled: true
        jq --arg wanif "$WANIF" '
            map(if .Name == $wanif then
                .Type = "Uplink" | .Enabled = true
            else . end)
        ' "$interfaces_json" > "$temp_json"

        # Check if WANIF entry exists, if not add it
        if ! jq -e --arg wanif "$WANIF" 'any(.Name == $wanif)' "$temp_json" > /dev/null 2>&1; then
            jq --arg wanif "$WANIF" '. += [{"Name": $wanif, "Type": "Uplink", "Enabled": true}]' "$temp_json" > "${temp_json}.2"
            mv "${temp_json}.2" "$temp_json"
        fi

        # Update LANIF to Type: Downlink, Enabled: true (if LANIF is set)
        if [ -n "$LANIF" ]; then
            jq --arg lanif "$LANIF" '
                map(if .Name == $lanif then
                    .Type = "Downlink" | .Enabled = true
                else . end)
            ' "$temp_json" > "${temp_json}.2"
            mv "${temp_json}.2" "$temp_json"

            # Check if LANIF entry exists, if not add it
            if ! jq -e --arg lanif "$LANIF" 'any(.Name == $lanif)' "$temp_json" > /dev/null 2>&1; then
                jq --arg lanif "$LANIF" '. += [{"Name": $lanif, "Type": "Downlink", "Enabled": true}]' "$temp_json" > "${temp_json}.2"
                mv "${temp_json}.2" "$temp_json"
            fi
        fi

        mv "$temp_json" "$interfaces_json"
    else
        # Create new interfaces.json with WAN and optionally LAN
        if [ -n "$LANIF" ]; then
            jq -n --arg wanif "$WANIF" --arg lanif "$LANIF" '[
                {"Name": $wanif, "Type": "Uplink", "Enabled": true},
                {"Name": $lanif, "Type": "Downlink", "Enabled": true}
            ]' > "$interfaces_json"
        else
            jq -n --arg wanif "$WANIF" '[
                {"Name": $wanif, "Type": "Uplink", "Enabled": true}
            ]' > "$interfaces_json"
        fi
    fi

    # Write PLUS token to api.json if set
    if [ -n "$PLUS_TOKEN" ] || [ -f "$API_JSON" ]; then
        # Update or create api.json with PLUS token
        if [ -f "$API_JSON" ]; then
            # Update existing api.json
            jq --arg token "$PLUS_TOKEN" '.PlusToken = $token' "$API_JSON" > "${API_JSON}.tmp"
            mv "${API_JSON}.tmp" "$API_JSON"
        else
            # Create new api.json with PLUS token
            jq -n --arg token "$PLUS_TOKEN" '{PlusToken: $token, Plugins: []}' > "$API_JSON"
        fi
    fi

    # Write admin password if set
    if [ -n "$ADMIN_PASSWORD" ]; then
        # Ensure api config directory exists
        mkdir -p "$(dirname "$AUTH_USERS")"
        # Create JSON with admin password (basic format for now)
        echo "{\"admin\": \"$ADMIN_PASSWORD\"}" > "$AUTH_USERS"
        chmod 600 "$AUTH_USERS"
    fi

    # Write WiFi configs if SSID and country are set
    if [ -n "$WIFI_SSID" ] && [ -n "$WIFI_COUNTRY" ] && [ -n "$WIFI_PASSWORD" ]; then
        local wifi_config_dir="${SUPERDIR}/configs/wifi"
        mkdir -p "$wifi_config_dir"

        # Update wpa2pskfile - replace wildcard entry while preserving device-specific entries
        if [ -f "$wifi_config_dir/wpa2pskfile" ]; then
            # Remove old wildcard entry (MAC 00:00:00:00:00:00)
            grep -v "^00:00:00:00:00:00 " "$wifi_config_dir/wpa2pskfile" > "$wifi_config_dir/wpa2pskfile.tmp" || true
            # Add new wildcard entry
            echo "00:00:00:00:00:00 ${WIFI_PASSWORD}" >> "$wifi_config_dir/wpa2pskfile.tmp"
            mv "$wifi_config_dir/wpa2pskfile.tmp" "$wifi_config_dir/wpa2pskfile"
        else
            # Create new file with wildcard entry
            echo "00:00:00:00:00:00 ${WIFI_PASSWORD}" > "$wifi_config_dir/wpa2pskfile"
        fi

        # Update sae_passwords - replace wildcard entry while preserving device-specific entries
        if [ -f "$wifi_config_dir/sae_passwords" ]; then
            # Remove old wildcard entry (MAC ff:ff:ff:ff:ff:ff)
            grep -v "|mac=ff:ff:ff:ff:ff:ff\$" "$wifi_config_dir/sae_passwords" > "$wifi_config_dir/sae_passwords.tmp" || true
            # Add new wildcard entry
            echo "${WIFI_PASSWORD}|mac=ff:ff:ff:ff:ff:ff" >> "$wifi_config_dir/sae_passwords.tmp"
            mv "$wifi_config_dir/sae_passwords.tmp" "$wifi_config_dir/sae_passwords"
        else
            # Create new file with wildcard entry
            echo "${WIFI_PASSWORD}|mac=ff:ff:ff:ff:ff:ff" > "$wifi_config_dir/sae_passwords"
        fi

        # For each WiFi interface, update or create hostapd config
        for iface in $(ls /sys/class/net/ 2>/dev/null | grep '^wlan' || true); do
            local hostapd_conf="$wifi_config_dir/hostapd_${iface}.conf"

            if [ -f "$hostapd_conf" ]; then
                # File exists - only update SSID and country_code to preserve advanced settings
                sed -i "s/^ssid=.*/ssid=${WIFI_SSID}/" "$hostapd_conf"
                sed -i "s/^country_code=.*/country_code=${WIFI_COUNTRY}/" "$hostapd_conf"
            else
                # Create new config with default settings
                # Detect band using iw (if available)
                local hw_mode="a"
                local channel="36"

                if command -v iw &> /dev/null; then
                    # Try to detect if 2.4GHz or 5GHz
                    local phy=$(iw dev "$iface" info 2>/dev/null | grep wiphy | awk '{print $2}')
                    if [ -n "$phy" ]; then
                        if iw phy "phy${phy}" info 2>/dev/null | grep -q "2400 MHz"; then
                            hw_mode="g"
                            channel="6"
                        fi
                    fi
                fi

                # Create basic hostapd config
                cat > "$hostapd_conf" <<EOF
ctrl_interface=/state/wifi/control_${iface}
country_code=${WIFI_COUNTRY}
interface=${iface}
ssid=${WIFI_SSID}
hw_mode=${hw_mode}
channel=${channel}
ieee80211d=1
ieee80211n=1
ieee80211ac=1
ieee80211h=1
ieee80211w=1
beacon_prot=1
wmm_enabled=1
auth_algs=1
wpa=2
wpa_key_mgmt=WPA-PSK WPA-PSK-SHA256 SAE
rsn_pairwise=CCMP
ap_isolate=1
per_sta_vif=1
sae_pwe=2
wpa_psk_file=${wifi_config_dir}/wpa2pskfile
sae_psk_file=${wifi_config_dir}/sae_passwords
EOF
            fi
        done

        # Update interfaces.json to enable WiFi interfaces
        local interfaces_json="${CONFIG_DIR}/interfaces.json"

        # Get list of wlan interfaces
        local wlan_ifaces=($(ls /sys/class/net/ 2>/dev/null | grep '^wlan' || true))

        # Build JSON array for WiFi interfaces
        local wlan_json_entries=""
        for iface in "${wlan_ifaces[@]}"; do
            if [ -n "$wlan_json_entries" ]; then
                wlan_json_entries="${wlan_json_entries},"
            fi
            wlan_json_entries="${wlan_json_entries}{\"Name\":\"${iface}\",\"Type\":\"AP\",\"Subtype\":\"\",\"Enabled\":true}"
        done

        # Update or create interfaces.json
        if [ -f "$interfaces_json" ] && [ -s "$interfaces_json" ]; then
            # File exists - merge with existing interfaces, preserving non-wlan entries
            # Remove existing wlan entries and add updated ones
            local temp_json=$(mktemp)
            jq --argjson wlan_ifaces "[${wlan_json_entries}]" '
                # Remove existing wlan entries
                map(select(.Name | test("^wlan") | not)) +
                # Add new wlan entries
                $wlan_ifaces
            ' "$interfaces_json" > "$temp_json"
            mv "$temp_json" "$interfaces_json"
        else
            # Create new interfaces.json with WiFi interfaces
            echo "[${wlan_json_entries}]" | jq '.' > "$interfaces_json"
        fi
    fi

    # Write hostname if configured
    if [ -n "$HOSTNAME_CONFIG" ]; then
        echo "$HOSTNAME_CONFIG" > "${SUPERDIR}/configs/base/hostname"
    fi
}

# Confirm exit
confirm_exit() {
    $DIALOG --clear --title "Exit" \
        --yesno "Exit without saving?" 7 40

    if [ $? -eq 0 ]; then
        clear
        exit 0
    fi
}

# Initialize variables with current values
WANIF=$(get_config_value "WANIF")
LANIF=$(get_config_value "LANIF")
TINYNET=$(get_current_subnet)
GATEWAY=$(get_current_lanip)
UPSTREAM_SERVICES_ENABLE=$(get_config_value "UPSTREAM_SERVICES_ENABLE")
WIREGUARD_PORT=$(get_config_value "WIREGUARD_PORT")
PLUS_TOKEN=$(get_plus_token)
WIFI_SSID=""
WIFI_COUNTRY=""
WIFI_PASSWORD=""
HOSTNAME_CONFIG=""
ADMIN_PASSWORD=""

# Show welcome screen
$DIALOG --clear --title "Welcome to SPR Setup" \
    --msgbox "SPR Setup - Text User Interface\n\nConfigure your SPR (Secure Programmable Router)\n\nFor more information:\nwww.supernetworks.org\n\nUse arrow keys to navigate, Enter to select." 12 60

# Start main menu
main_menu

clear
