# Secure Programmable Router (SPR) Release Notes

## v1.0.23
**Improvements**
- Link view now supports additional IP/routes

**Fixes**
- fix ipv4 parsing exception for link views with ipv6
- do not enable bss randomization by default
- auto assign addresses to floating hardware macs
- pick a subnet better
- fix the wifi renaming script as it was buggy
- add more sanitization since the interface names can have shell metacharacters (yay linux)

## v1.0.19-22
**Improvements**
- Fix mesh deadlocks
- Enable neighbor reports by default
- Installer fixes

## v1.0.18

**Improvements*
Switch to LTS 24.04.3 for base image


## v1.0.17
**Fixes**
- Fix builds for multi node, self-hosted

## v1.0.16
**Improvements**
- Added RSSI threshold support for limiting when devices connect
- Added support for multiple TLS dns upstreams to coredns
- Support open ssid for uplink connections
**Fixes**
- Smoothed out OTP flow for plugins, fixed OTP login, added OTP rate limits
- Golang module updates

## v1.0.15
**Fixes**
- Bump build for guest ap fix
- Add gvisor demo
- Add watchdog support
- Fix OTP bug with API, breaking login with otp

## v1.0.14
**Fixes**
- Fix viewport size for plugins
- Fix pending devices vs guest ap

## v1.0.13
**Improvements**
- Show QR Code for Guest WiFi
- New "guestonly" policy for Guest APs

## v1.0.12
**Improvements**
- Golang version update & module upgrades
- New API Block Policy to restart API/SSH access
- Support for Guest SSIDs with static passwords
**Fixes**
- When multiple uplinks are configured but disconnected, choose only uplinks with routes set

## v1.0.11
**Improvements**
- Tabbed Firewall Views
- New PFW Flow Search
- Client Select Redesign with Search
**Fixes**
- Fix dhcp time updates when editing devices and IP is not changed

## v1.0.10
**Improvements**
- 24.10 installer for CM5 support
**Notes**
- 25.04 has driver compatibility problems with r8125, mt7915e pending

## v1.0.9
**Fixes**
- When resetting a wireless interface a bug was introduced with CCMP-128 set incorrectly

## v1.0.8
**Improvements**
- Support for CM5 board & installer
- Improved LANIF support
- Throw events apport crashes
**Fixes**
- Fix interface name swapping races with mt7915e, other DBDC cards
- When setting an uplink MAC address it was incorrectly removed from the uplink set
- Disabled GCMP by default since it broke some HiSuite devices


## v1.0.5
**Improvements**
- Override DNS for devices
- Outbound firewall rules
- Users can now override System Outbound DNS with DNAT

## v1.0.4
**Improvements**
- New Icons
- New Blocklist View
- Support for Override Lists
- Can now use blocklists to categorize domains
- Can now update wifi passwords on the edit device view
- New Icons
**Fixes**
- Fix operating class for 5ghz channel selection

## v1.0.3
**Fixes**
- Support for DNS Configuration Updates incorrectly cleared plugin settings
- Fix Virtual nft rules bug

## v1.0.2
**Improvements**
- Introduces CNAME Support for DNS Overrides
**Fixes**
- dns:family policy fix in UI

## v1.0.1
**Improvements**
- Emoji support for ssids in wifi uplink, dashboard
- Policy based DNS Selection for devices, for Family Friendly DNS
- DNS Blocklists can now categorize logs and optionally block
**Fixes**
- Hardens conntrack #375. This prevents 1 hop attacak against conntrack for IP spoofing on externally exposed service ports
- #375 also prevents UDP spoofing across VLANs by moving the MAC filter before conntrack
- Packet_logs sometimes dropped messages with unsupported payload types

## v1.0
**Improvements**
- CI has Attestation with cosign, gh attest now for containers & isos
- Improved Link Settings UI with icons
- DB API now supports strict min/max and ordering asc/dsc

**Fixes**
- Fix default service port flush for lan interfaces
- Fix DB Locking

## v0.3.25
**Improvements**
- In the base container, removed xattr for ping, to increase kernel compatibility

## v0.3.24
**Improvements**
- Service healthcheck 
- Events view with multiple event types
- Timeline view for events
- WiFi AP Widget now shows frequency
**Fixes**
- OTP Code required for backups, feature setting

## v0.3.23
**Fixes**
- Various fixes for Setup
- Show up to date subnet info when restoring from backup
- Devices list will now only show authorized as green, and associated only as Yellow
- Have mesh sync back off while work is runing
**Improvements**
- Show time in current browser's timezone
- Add docker service status API
- Add health check to home page
- Keep SSID on wifi config reset 

## v0.3.22 
- Fix for device expiries

## v0.3.21
- Switch to 24.04.1 base image


## v0.3.20
**Changes**
- PLUS users now use plus.supernetworks.org for git and registry
**Fixes**
- WiFi selection bug with 149,165 on 80mhz has been fixed
- Setup improvements, enable HTTP setup again
- Embed docker gpg key in superd to fix github CI flakiness
**Improvements**
- Add IP addresses to auth events
- Change setup ap name


## v0.3.19
**Fixes**
* Better setup 
* Better Mesh UI

## v0.3.18
Improvements
* TLS support for mesh setup
* Improved setup flow UI
* Reduce logging on HTTP services
* H2E support in wifid

## v0.3.17
**Fixes**
* After applying BSSID randomization, always restart wifid 

## v0.3.16
**Fixes**
* Security fix for OTP bypass on plugin update
* Clean up Plugin URI route
* Fix PFW Abort
* Clean up OTP handling

## v0.3.15
**Fixes**
* Address APNS memory consumption bug 
* Ping API call was broken 
* Undo shadowports mitigation as it breaks sitevpn use cases

Improvements
* API performance refactoring with the event bus & notifications channel
* Improved packet_logs performance with cached interface name lookups

## v0.3.14
**Fixes**
* Fix deadlock in API with Devices mutex
* Fix setup transitions, rework setup flow

Improvements
* Add wireguard hardening for shadow port attacks
* Add static public routes for plugins
* Support SPR WiFI6e hats by default in spr build images
* Support submodules for plugin code

## v0.3.13
Improvements
* New BSSID Randomization Feature
* New Setup flow for SPR
* New PI installer with qemu aarch64
* Improved TLS Support
* Reworked UI for more tabbed views where logical

## v0.3.12
Key Fixes
* Fix multicast proxy skipping AP interfaces incorrectly
Improvements
* LAN Link under one view
* Device List UI improvements
* ACS support
* If something goes wrong with WiFi config/channels, load a failsafe
* Hostapd updated from upstream

## v0.3.11
Major change
* Image builder set to 24.04 base.
Key Fixes
* Plugin events from superd introduced a problem with older versions of docker, causing restart issues. now fixed in dev branch
* Fixed incorrect UI redirect when no devices with a MAC address were left
Improvements
* New Device view, faster, with sorting by IP, Time, Name, Tag & Group
* Rendered Devices are now clickable throughout the UI
* WiFi Channel selection fixed. It would hang on the wrong band when switching interfaces
* Moved version check into badge on top instead of popups
* Alerts view now categorizes by alert type and are searchable
* Simple field counts for the Alerts & Events views
* Container networking is now under a Containers Tab under System Info
* Arp under System Info -> Network Info Tab
* Supernetworks view is now "DHCP Settings"

## v0.3.10
* Revert wpa2 behavior for wpa3 devices for now

## v0.3.9
* Various bug fixes
* Stop applying wpa2 to wpa3 devices

## v0.3.8
* Improve e2e testing
* Add fixes for 'disabled' policy handling
* Fix policy handling for multiple container interface rules
* Alerting improvements

## v0.3.7
* Rename builtin groups as Policies, to clarify Group vs Tag vs Policy
* Merged dns rebinding and block plugin, added UI to turn off rebinding protection
* Changed cache behavior to no longer cache NXDomain, so permit override is instant
* Added iOS Push Notification Support
* Can now name router from UI
* Can now override MAC addresses for interfaces
* Fixed Scoped Token Paths to allow :r path to come first

## v0.3.6
* Fix regression with VPN only mode devices

## v0.3.5
* Alert view fixes & UI Fixes
* Catch auth:failure events by default
* Add device names as '.lan' domains
* Update base image to 23.10 mantic for pi5 support with the 6.5 kernel

## v0.3.4
* Support for 6-e channel calculation in API
* Add decorators to alert templates
* Fast Plugin install with URL & OTP
* For Pis, enable a Setup AP for easy access
Key Fixes
* Multitude of UI/Gluestack fixes (see github issue tracker)

## v0.3.3
* New Alerts functionality
* New Events filters, Events UI Improvements
* Migrate notifications to new Alerts view
* Add OTP hardening for tokens, OTP support
* Add Easy Plugin install with OTP Check
* Add TLS during install, TLS on in UI
* Add Report Install/Auto Check for Updates flags
Key Fixes
* Fix Mesh UI Display error
* Fix UI Tag, Group selection
* Fixed DB Compaction logic to store more events, increased fill limit
* Fix SrcPort

## v0.3.2
* Fixes for DNS Log date picker
* Add Domain info from recent lookups to TrafficList and the packet event log
* Add tag support and populating interfaces from Docker for Custom Interface rules
* Further simplify some dialogues in simple mode
* Fix reload of custom compose paths, without restarting superd
* Reduce UI load size by switching syntax highlighter for events

## v0.3.1

* Add 'api' group for Custom Interface firewall rules, to enable SPR API Access
* Custom Interface Rules now offer an optional route destination
* New DNS View filters and search
* Improved support for SPR Virtual mode and PLUS
* Reduce DNS-Block memory consumption with BoltDB
* Refactor www:auth events into auth:failure/ auth:success events
* Scrubbed PSKs from device events from API
* Keyboard shortcut for search on desktop: shift+/

## v0.3

* New API `/firewall/custom_interface` for joining new interfaces to the network, as if they were devices. Supports assigning device groups such as `wan`, `lan`, `dns` and custom groups.
* New container networks view for an overview of the docker containers on custom (non-default) networks.
* Firewall view has new `Custom Interface Access` rules for updating `custom_interface` rules
* Introduce "Simple" view for UI to reduce cognitive overload for new users
* Wireguard clients can now access LAN services again
* Add `base/configs/custom_compose_paths.json` support to superd, enabling loading of custom compose files from the UI
* Pretty Events in Event Log

 **Fixes**
* UI errors related to the gluestack migration (wifi uplink, PFW, misc)
* Fix tag and group list normalization to remove empty entries
* VPN Endpoint/Domain name add was broken
