import { createServer, Model } from "miragejs"

// TODO alot of this can be parsed from OpenAPI definitions
export default function MockAPI() {
  let server = createServer({
    models: {
      devices: Model,
      zones: Model
    },
    seeds(server) {
      server.create('device', {
          "Name": "rpi4",
          "MAC": "11:22:33:44:55:61",
          "WGPubKey": "pubkey",
          "VLANTag": "vlantag",
          "RecentIP": "192.168.2.102",
          "PSKEntry": {
            "Type": "sae",
            "Psk": "password"
          },
          "Zones": ["lan", "dns"] ,
          "DeviceTags": ["private"]
        })

      server.create('device', {
          "Name": "rpi23",
          "MAC": "11:22:33:44:55:61",
          "WGPubKey": "pubkey",
          "VLANTag": "vlantag",
          "RecentIP": "192.168.2.103",
          "PSKEntry": {
            "Type": "sae",
            "Psk": "password"
          },
          "Zones": ["lan", "dns"],
          "DeviceTags": ["private"]
        })

      server.create('zone', { Name: "lan", disabled: false, ZoneTags: [] })
      server.create('zone', { Name: "wan", disabled: false, ZoneTags: [] })
      server.create('zone', { Name: "dns", disabled: false, ZoneTags: [] })
    },
    routes() {
      this.get('/status', (schema, request) => {
        return '"Online"'
      })

      this.get('/devices', (schema) => {
        return schema.devices.all().models
      })

      this.put('/device/:id', (schema, request) => {
        let MAC = request.params.id
        let dev = schema.devices.findBy({MAC})
        let attrs = JSON.parse(request.requestBody)

        if (dev) {
          dev.update(attrs)
          return dev
        } else {
          let _dev = {MAC, Name: attrs.Name, PSKEntry: attrs.PSKEntry, Zones: [], DeviceTags: []}
          return schema.devices.create(_dev)
        }
      })

      this.get('/zones', (schema, request) => {
        return schema.zones.all().models
      })

      this.del('/device/:id', (schema, request) => {
        let id = request.params.id
        return schema.devices.findBy({MAC: id}).destroy()
      })

      this.get('/pendingPSK', (schema, request) => {
        return false
      })

      this.get('/arp', (schema, request) => {
        return [{
          "IP": "192.168.2.142",
          "HWType": "0x1",
          "Flags": "0x6",
          "MAC": "11:22:33:44:55:66",
          "Mask": "*",
          "Device": "wlan1.4097"
        }]
      })

      this.get('/nfmap/:id', (schema, request) => {
        let id = request.params.id
        if (id.match(/(lan|internet|dns|dhcp)_access/)) {
          return {nftables: [{}, {map: {elem: ["wifi0", "eth0"], type: "zz"} }]}
        }

        return {}
      })

      this.get('/ip/addr', (schema) => {
        return [
          {
            "ifindex": 1,
            "ifname": "eth0",
            "flags": [
              "BROADCAST"
            ],
            "mtu": 0,
            "qdisc": "string",
            "operstate": "UP",
            "group": "default",
            "txqlen": 1000,
            "link_type": "ether",
            "address": "11:22:33:44:55:66",
            "broadcast": "ff:ff:ff:ff:ff:ff",
            "addr_info": [
              {
                "family": "inet4",
                "local": "192.168.2.1",
                "prefixlen": 24,
                "scope": "global",
                "valid_life_time": 4294967295,
                "preferred_life_time": "preferred_life_time"
              }
            ]
          }
        ]
      })

      this.get('/iptraffic', (schema) => {
        return [{
            "Interface": "wlan1",
            "Src": "192.168.2.100",
            "Dst": "192.168.2.102",
            "Packets": 1024,
            "Bytes": 4096
          }]
      })

      this.get('/traffic/:id', (schema) => {
        return [{
            "IP": "192.168.2.1",
            "Packets": 7544,
            "Bytes": 824606
          }]
      })

      this.get('/traffic_history', (schema) => {
        return {
          "192.168.2.11": {
            "LanIn": 11125256532,
            "LanOut": 292437928,
            "WanIn": 52664,
            "WanOut": 52664
          },
          "192.168.2.12": {
            "LanIn": 11125256532,
            "LanOut": 292437928,
            "WanIn": 52664,
            "WanOut": 52664
          }
        }
      })

      this.get('/hostapd/config', (schema) => {
        return '"testconfig"'
      })

      this.get('/hostapd/all_stations', (schema) => {
        return {
            "11:22:33:44:55:61": {
                  "AKMSuiteSelector": "00-0f-ac-2",
                  "aid": "3",
                  "capability": "0x11",
                  "connected_time": "4946",
                  "dot11RSNAStatsSTAAddress": "11:22:33:44:55:61",
                  "dot11RSNAStatsSelectedPairwiseCipher": "00-0f-ac-4",
                  "dot11RSNAStatsTKIPLocalMICFailures": "0",
                  "dot11RSNAStatsTKIPRemoteMICFailures": "0",
                  "dot11RSNAStatsVersion": "1",
                  "flags": "[AUTH][ASSOC][AUTHORIZED][WMM][HT]",
                  "hostapdWPAPTKGroupState": "0",
                  "hostapdWPAPTKState": "11",
                  "ht_caps_info": "0x016e",
                  "ht_mcs_bitmask": "ff000000000000000000",
                  "inactive_msec": "1584",
                  "listen_interval": "1",
                  "rx_bytes": "126055",
                  "rx_packets": "2394",
                  "rx_rate_info": "60",
                  "signal": "-85",
                  "supported_rates": "8c 12 98 24 b0 48 60 6c",
                  "timeout_next": "NULLFUNC POLL",
                  "tx_bytes": "485584",
                  "tx_packets": "1957",
                  "tx_rate_info": "1200 mcs 5 shortGI",
                  "vlan_id": "4247",
                  "wpa": "2"
                },
            "11:22:33:44:55:62": {
                  "AKMSuiteSelector": "00-0f-ac-2",
                  "aid": "3",
                  "capability": "0x11",
                  "connected_time": "4946",
                  "dot11RSNAStatsSTAAddress": "11:22:33:44:55:61",
                  "dot11RSNAStatsSelectedPairwiseCipher": "00-0f-ac-4",
                  "dot11RSNAStatsTKIPLocalMICFailures": "0",
                  "dot11RSNAStatsTKIPRemoteMICFailures": "0",
                  "dot11RSNAStatsVersion": "1",
                  "flags": "[AUTH][ASSOC][AUTHORIZED][WMM][HT]",
                  "hostapdWPAPTKGroupState": "0",
                  "hostapdWPAPTKState": "11",
                  "ht_caps_info": "0x016e",
                  "ht_mcs_bitmask": "ff000000000000000000",
                  "inactive_msec": "1584",
                  "listen_interval": "1",
                  "rx_bytes": "126055",
                  "rx_packets": "2394",
                  "rx_rate_info": "60",
                  "signal": "-85",
                  "supported_rates": "8c 12 98 24 b0 48 60 6c",
                  "timeout_next": "NULLFUNC POLL",
                  "tx_bytes": "485584",
                  "tx_packets": "1957",
                  "tx_rate_info": "1200 mcs 5 shortGI",
                  "vlan_id": "4247",
                  "wpa": "2"
                }
        }
      })
    }
  })

  //console.log('mockapi:', typeof jest)
  if (jest !== undefined) {
    server.logging = false
  }

  return server
}
