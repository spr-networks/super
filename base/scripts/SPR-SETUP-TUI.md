# SPR Setup TUI

An nmtui-style text user interface for configuring SPR (Smart Private Router).

## Overview

`spr-setup-tui.sh` provides a menu-driven interface for configuring SPR, similar to NetworkManager's `nmtui` tool. It's perfect for headless installations or users who prefer terminal-based configuration.

## Features

- **Network Settings**
  - Select WAN (uplink) interface
  - Configure optional LAN interface
  - Set LAN subnet and gateway

- **Admin Password**
  - Set initial admin password for web interface
  - Password confirmation

- **Advanced Settings**
  - Enable/disable upstream services (SSH/API from WAN)
  - Virtual SPR mode (VPN gateway without WiFi)
  - WireGuard port configuration

- **View Configuration**
  - Display current settings

- **Save and Apply**
  - Write configuration to disk

## Usage

### Run the Setup TUI

```bash
cd /home/spr/super
sudo ./base/scripts/spr-setup-tui.sh
```

### Navigation

- **Arrow keys**: Move between options
- **Enter**: Select an option
- **Tab**: Move between buttons
- **Escape**: Go back/cancel

### Configuration Flow

1. **Start the tool**: You'll see a welcome screen
2. **Main Menu**: Choose what to configure
   - Network Settings (Required)
   - Admin Password (Recommended)
   - Advanced Settings (Optional)
3. **Network Settings**:
   - Select your internet-connected interface (WAN)
   - Optionally select a LAN ethernet port
   - Configure your LAN subnet (default: 192.168.2.0/24)
4. **Save Configuration**: Select "Save and Exit" from main menu

## Files Modified

The tool modifies the following configuration files:

- `/home/spr/super/configs/base/config.sh` - Main configuration
- `/home/spr/super/configs/base/dhcp.json` - DHCP settings
- `/home/spr/super/configs/base/lanip` - LAN gateway IP
- `/configs/api/auth_users.json` - Admin credentials (if password set)

## Requirements

- `dialog` or `whiptail` package (automatically installed by SPR setup)
- `jq` for JSON manipulation
- Root or sudo access

## Examples

### Basic Setup

1. Select WAN interface: `eth0`
2. LAN interface: `None (WiFi only)`
3. LAN subnet: `192.168.2.0/24` (default)
4. Set admin password
5. Save and exit

### Advanced Setup with Dedicated LAN Port

1. Select WAN interface: `eth0`
2. LAN interface: `eth1`
3. LAN subnet: `10.0.0.0/24`
4. Set admin password
5. Enable upstream services (if you want SSH from WAN)
6. Save and exit

### VPN Gateway Mode

1. Select WAN interface: `eth0`
2. LAN interface: `eth1`
3. LAN subnet: `192.168.2.0/24`
4. Advanced Settings → Enable Virtual SPR Mode
5. Save and exit

## Comparison with Web Setup

| Feature | Web Setup | TUI Setup |
|---------|-----------|-----------|
| WiFi SSID + Country Code | ✓ | ✓ |
| First-device WiFi password | ✓ | ✓ |
| Network Interfaces | ✓ | ✓ |
| LAN Subnet | ✓ | ✓ |
| Admin Password | ✓ | ✓ |
| Advanced Settings | ✓ | ✓ |
| Accessibility | Requires display | SSH-friendly |
| Per-channel / band tuning | ✓ | ✗ (use web after) |

## Troubleshooting

### Dialog not found

```bash
sudo apt-get install dialog
```

### Permission denied

Make sure to run with sudo:

```bash
sudo ./base/scripts/spr-setup-tui.sh
```

### Configuration not applied

After saving, you may need to restart SPR services:

```bash
sudo systemctl restart spr
# or
cd /home/spr/super && docker-compose restart
```

## Integration with Installation

This tool can be used:

1. **During initial setup**: Run before the web-based setup
2. **Post-installation**: Reconfigure network settings
3. **Automated deployments**: Script configuration for multiple devices
4. **Headless installations**: Configure without web browser

## Future Enhancements

Potential additions:
- WiFi configuration (SSID, country code)
- DNS settings
- Static IP configuration for WAN
- Firewall rules
- Device management

## See Also

- Web Setup: `/auth/setup` on your SPR device
- Config file: `/home/spr/super/configs/base/config.sh`
- SPR Documentation: https://www.supernetworks.org
