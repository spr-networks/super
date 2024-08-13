# Secure Programmable Router (SPR) Release Notes

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
