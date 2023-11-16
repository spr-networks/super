# Secure Programmable Router (SPR) Release Notes

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
