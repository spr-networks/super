# API

The API service provides a Web API for web front-ends and CLI tools, and internal APIs for IPC over unix sockets.
Currently there are 2 internal APIs, one for wifid communication and a second one for IPC from the DHCPd serice.

## DHCP API

### DHCP Update
**PUT /dhcpUpdate/**

When a device DHCP's successfully, this endpoint receives metadata
about the request to populate routes, verdict maps, arp entries, and local DNS mappings

| Key         | Value       | Type 
| ----------- | ----------- | -----------
| IP          | IP Address  | string
| MAC         | HW Addr     | string
| Name        | DHCP Name   | string
| Iface       | Iface Name  | string
| Router      | Router IP   | string

## WiFi API

### PSK Authentication Failure 
**PUT /reportPSKAuthFailure/**

When a station fails to authenticate, the wifi station reports the data to the API


| Key         | Value       | Type 
| ----------- | ----------- | -----------
| Type         | sae or wpa  | string
| MAC          | HW Addr     | string
| Reason       | Failure Reason | string
| Status       | Iface Name  | string

#### Notes:
Reason can be "noentry" for when the MAC is unknown or "mismatch" for wrong password

#### Discussion:
In WPA3, it's not possible to try multiple MAC address/password pairs because of the ZKP properties.

When a new device password is assigned, and it is in the pending state, the next "noentry" mismatch will see
that MAC address get the pending password assigned. This binds that pending password to that MAC address.
The pending password is also assigned through the success path. 


**Response**
| Key         | Value       | Type 
| ----------- | ----------- | -----------
| Type         | sae or wpa  | string
| MAC          | HW Addr     | string
| Reason       | Failure Reason | string
| Status       | Result  | string

Result can be "Installed pending PSK" 


### PSK Authentication Success 
**PUT /reportPSKAuthSuccess/**

| Key         | Value       | Type 
| ----------- | ----------- | -----------
| Iface       | IP Address  | string
| Event       |  AP-STA-CONNECTED | string
| MAC         | HW Addr     | string

When a station succeeds to authenticate, the wifid service reports that to the API

#### Discussion:
If there is a pending PSK to assign, and the the MAC address that just authenticated is not
known, it will get assigned to the pending PSK. 


#### Return Value


| Key         | Value       | Type 
| ----------- | ----------- | -----------
| Iface       | IP Address  | string
| Event       |  AP-STA-CONNECTED | string
| MAC         | HW Addr     | string
| Status      | Status   | string

Status is "Okay" or "Installed pending PSK"

## Public External API

### Get Frontend Website
**GET /**


## Authenticated External APIs

### Get status
**GET /status/**

Returns Online. Can be used to test authentication

### List Zones
**GET /zones/**

Returns the Zone information as a JSON result


ClientZone Object

| Key         | Value       | Type 
| ----------- | ----------- | -----------
| Name        | Unique Zone Name  | string
| Client      | Clients in Zone  |  List of Client objects

Client Object

| Key         | Value       | Type 
| ----------- | ----------- | -----------
| MAC         | HW Address  | string
| Client      | Comment, can incldue device name  |  string





### Add a Client to a Zone
**PUT /zone/{name}**

Adds a Client to a zone, named by the name in the path parameter.
If the zone does not exist, the zone will be created.
If the comment is different, it will be updated.

Client Object

| Key         | Value       | Type 
| ----------- | ----------- | -----------
| MAC         | HW Address  | string
| Client      | Comment, can incldue device name  |  string



### Remove a client form a Zone
**DELETE /zone/{NAME}**

Client Object

| Key         | Value       | Type 
| ----------- | ----------- | -----------
| MAC         | HW Address  | string
| Client      | Comment, can include device name  |  string

### Create a new PSK 
**GET /setPSK**

PSKEntry Object

| Key         | Value       | Type 
| ----------- | ----------- | -----------
| Type        | sae or wpa  | string
| Mac         | HW Address  | string (optional)
| Psk         | Password    | string (optional)

If "Psk" is an empty string, a secure password will be generated and returned
If "Mac" is an empty string, the entry will be set as pending until a device authenticates.

Return Value

| Key         | Value       | Type 
| ----------- | ----------- | -----------
| Type        | sae or wpa  | string
| Mac         | HW Address  | string
| Psk         | Password    | string


### Delete an existing PSK
**DELETE /setPSK**

The MAC address of the object will be looked up and deleted from the PSKs.

PSKEntry Object
| Key         | Value       | Type 
| ----------- | ----------- | -----------
| Type        | sae or wpa  | string
| MAC         | HW Address  | string
| Psk         | Password    |  string




### Reload PSK files
**PUT /reloadPSKFiles**

Reloads the Hostapd PSK Files. Hostapd has been fixed to prevent booting off stations when this happens with WPA3.
This is also called when a new PSK is assigned or when a PSK has a MAC assigned.


## Authentication
### Basic Authentication
Set API_USERNAME and API_PASSWORD in config.sh

### WebAuthN
TBD

GET /register/?username={username}
POST /register/
GET /login/?username=username
POST /login/



