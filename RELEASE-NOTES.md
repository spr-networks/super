# Secure Programmable Router (SPR) Release Notes
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
