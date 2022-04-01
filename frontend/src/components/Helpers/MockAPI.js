import { createServer, Model, Response } from "miragejs"

// TODO alot of this can be parsed from OpenAPI definitions
export default function MockAPI() {
  let server = createServer({
    models: {
      devices: Model,
      zones: Model,
      dnsblocklist: Model,
      dnsoverride: Model,
      dnslogprivacylist: Model,
      dnslogdomainignorelist: Model,
    },
    seeds(server) {
      server.create('device', {
          "Name": "rpi4",
          "MAC": "11:22:33:44:55:66",
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
          "MAC": "11:11:11:11:11:11",
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

      server.create('dnsblocklist', {"URI": "https://raw.githubusercontent.com/blocklistproject/Lists/master/ads.txt", "Enabled": true})
      server.create('dnsblocklist', {"URI": "https://raw.githubusercontent.com/blocklistproject/Lists/master/youtube.txt", "Enabled": false})
      server.create('dnsoverride', {
        "Type": "block",
        "Domain": "example.com.",
        "ResultIP": "1.2.3.4",
        "ClientIP": "192.168.2.102",
        "Expiration": 0
      })

      server.create('dnsoverride', {
        "Type": "block",
        "Domain": "asdf.com.",
        "ResultIP": "1.2.3.4",
        "ClientIP": "*",
        "Expiration": 0
      })

      server.create('dnsoverride', {
        "Type": "permit",
        "Domain": "google.com.",
        "ResultIP": "8.8.8.8",
        "ClientIP": "192.168.2.101",
        "Expiration": 123
      })

      server.create('dnslogprivacylist', '192.168.1.1')
      server.create('dnslogprivacylist', '192.168.1.2')
      server.create('dnslogdomainignorelist', 'example.com')
      server.create('dnslogdomainignorelist', 'privatedomain.com')
    },
    routes() {
      // TODO hook for all
      const authOK = (request) => {
        try {
          let [type, b64auth] = request.requestHeaders.Authorization.split(' ')
          return (type == 'Basic' && atob(b64auth) == 'admin:admin')
        } catch(err) {
          return false
        }
      }

      this.get('/status', (schema, request) => {
        return authOK(request) ? '"Online"' : '"Error"'
      })

      this.get('/devices', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, {error: "invalid auth"})
        }

        return schema.devices.all().models
      })

      this.put('/device/:id', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, {error: "invalid auth"})
        }

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
        if (!authOK(request)) {
          return new Response(401, {}, {error: "invalid auth"})
        }

        return schema.zones.all().models
      })

      this.del('/device/:id', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, {error: "invalid auth"})
        }

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

      this.get('/ip/addr', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, {error: "invalid auth"})
        }

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

      //DNS plugin
      this.get('/plugins/dns/block/config', (schema, request) => {
        return {
          "BlockLists": schema.dnsblocklists.all().models,
          "BlockDomains": schema.dnsoverrides.where({Type:'block'}).models,
          "PermitDomains": schema.dnsoverrides.where({Type:'permit'}).models,
          "ClientIPExclusions": null
        }
      })

      this.get('/plugins/dns/block/blocklists', (schema, request) => {
        return schema.dnsblocklists.all().models
      })

      this.put('/plugins/dns/block/blocklists', (schema, request) => {
        let attrs = JSON.parse(request.requestBody)
        return schema.dnsblocklists.create(attrs)
      })

      this.delete('/plugins/dns/block/blocklists', (schema, request) => {
        let attrs = JSON.parse(request.requestBody)
        let URI = attrs.URI
        return schema.dnsblocklists.findBy({URI}).destroy()
      })

      this.put('/plugins/dns/block/override', (schema, request) => {
        let attrs = JSON.parse(request.requestBody)
        return schema.dnsoverrides.create(attrs)
      })

      this.delete('/plugins/dns/block/override', (schema, request) => {
        let attrs = JSON.parse(request.requestBody)
        let Domain = attrs.Domain
        return schema.dnsoverrides.findBy({Domain}).destroy()
      })

      this.get('/plugins/dns/block/dump_domains', (schema, request) => {
        return ["_thums.ero-advertising.com.","0.fls.doubleclick.net.",
          "0.r.msn.com.","0.start.bz.","0.up.qingdaonews.com."]
      })

      this.get('/plugins/dns/log/config', (schema, request) => {
        return {
          "HostPrivacyIPList": schema.dnslogprivacylists.all().models,
          "DomainIgnoreList": schema.dnslogdomainignorelists.all().models
        }
      })

      this.get('/plugins/dns/log/host_privacy_list', (schema, request) => {
        console.log('>>', JSON.stringify(schema.dnslogprivacylists.all()))
        return ['192.168.1.1', '192.168.1.2']
        //return schema.dnslogprivacylists.all().models
      })

      this.get('/plugins/dns/log/domain_ignores', (schema, request) => {
        return ["example.dev", "example.com"]
        //return schema.dnslogdomainignorelists.all().models
      })

      this.get('/plugins/dns/log/history/:ip', (schema, request) => {
        let ip = request.params.ip//192.168.2.100
        return [
          {
            "Q": [
              {
                "Name": "102.2.168.192.in-addr.arpa.",
                "Qtype": 12,
                "Qclass": 1
              }
            ],
            "A": [
              {
                "Hdr": {
                  "Name": "102.2.168.192.in-addr.arpa.",
                  "Rrtype": 12,
                  "Class": 1,
                  "Ttl": 30,
                  "Rdlength": 0
                },
                "Ptr": "rpi4.lan."
              }
            ],
            "Type": "NOERROR",
            "FirstName": "102.2.168.192.in-addr.arpa.",
            "FirstAnswer": "rpi4.lan.",
            "Local": "[::]:53",
            "Remote": "192.168.2.102:50862",
            "Timestamp": "2022-04-01T08:05:34.983138386Z"
          },
          {
            "Q": [
              {
                "Name": "caldav.fe.apple-dns.net.",
                "Qtype": 65,
                "Qclass": 1
              }
            ],
            "A": [],
            "Type": "NODATA",
            "FirstName": "caldav.fe.apple-dns.net.",
            "FirstAnswer": "",
            "Local": "[::]:53",
            "Remote": "192.168.2.102:50216",
            "Timestamp": "2022-04-01T08:05:34.01579228Z"
          },
          {
            "Q": [
              {
                "Name": "lb._dns-sd._udp.102.2.168.192.in-addr.arpa.",
                "Qtype": 12,
                "Qclass": 1
              }
            ],
            "A": [],
            "Type": "OTHERERROR",
            "FirstName": "lb._dns-sd._udp.102.2.168.192.in-addr.arpa.",
            "FirstAnswer": "",
            "Local": "[::]:53",
            "Remote": "192.168.2.102:64151",
            "Timestamp": "2022-04-01T08:05:29.976935196Z"
          }
        ]
      })
    }
  })

  try {
    if (jest !== undefined) {
      server.logging = false
    }
  } catch(err) {}

  return server
}
