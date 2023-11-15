# Secure Programmable Router (SPR) Release Notes

## v0.3

* Key new API `/firewall/custom_interface` for networking arbitary interfaces with device groups such as `wan`, `lan`, `dns` and custom groups. Previously these interfaces were not routed, now they can be, with SPR's micro-segmentation approach.
* New container networks view for an overview of the docker containers on custom (non-default) networks.
* Firewall view has new `Custom Interface Access` rules for updating `custom_interface` rules
* Introduce "Simple" view for UI to reduce cognitive overload for new users
* Wireguard clients can now access LAN services again

 **Fixes**
* UI errors related to the gluestack migration (wifi uplink, PFW, misc)
* Fix tag and group list normalization to remove empty entries
