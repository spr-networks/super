import { createServer, Model, Response } from 'miragejs'

let server = null

// helper function for random and random value in array
const r = (n) => parseInt(Math.random() * n)
const rpick = (l) => l[parseInt(r(l.length))]

// TODO alot of this can be parsed from OpenAPI definitions
export default function MockAPI() {
  if (server) {
    return server
  }

  server = createServer({
    models: {
      devices: Model,
      zones: Model,
      dnsblocklist: Model,
      dnsoverride: Model,
      dnslogprivacylist: Model,
      dnslogdomainignorelist: Model
    },
    seeds(server) {
      server.create('device', {
        Name: 'rpi4',
        MAC: '11:11:11:11:11:11',
        WGPubKey: 'pubkey',
        VLANTag: 'vlantag',
        RecentIP: '192.168.2.101',
        PSKEntry: {
          Type: 'sae',
          Psk: 'password'
        },
        Zones: ['lan', 'dns'],
        DeviceTags: ['private']
      })

      server.create('device', {
        Name: 'rpi23',
        MAC: '22:22:22:22:22:22',
        WGPubKey: 'pubkey',
        VLANTag: 'vlantag',
        RecentIP: '192.168.2.102',
        PSKEntry: {
          Type: 'wpa2',
          Psk: 'password'
        },
        Zones: ['lan', 'dns'],
        DeviceTags: ['private']
      })

      for (let i = 3; i < 10; i++) {
        server.create('device', {
          Name: `device-${i}`,
          MAC: Array(6).fill(`${i}${i}`).join(':'),
          WGPubKey: 'pubkey',
          VLANTag: 'vlantag',
          RecentIP: `192.168.2.10${i}`,
          PSKEntry: {
            Type: rpick(['wpa2', 'sae']),
            Psk: `password${i}`
          },
          Zones: ['lan', 'dns'],
          DeviceTags: ['private']
        })
      }

      server.create('zone', { Name: 'lan', disabled: false, ZoneTags: [] })
      server.create('zone', { Name: 'wan', disabled: false, ZoneTags: [] })
      server.create('zone', { Name: 'dns', disabled: false, ZoneTags: [] })

      server.create('dnsblocklist', {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/ads.txt',
        Enabled: true
      })
      server.create('dnsblocklist', {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/youtube.txt',
        Enabled: false
      })
      server.create('dnsoverride', {
        Type: 'block',
        Domain: 'example.com.',
        ResultIP: '1.2.3.4',
        ClientIP: '192.168.2.101',
        Expiration: 0
      })

      server.create('dnsoverride', {
        Type: 'block',
        Domain: 'asdf.com.',
        ResultIP: '1.2.3.4',
        ClientIP: '*',
        Expiration: 0
      })

      server.create('dnsoverride', {
        Type: 'permit',
        Domain: 'google.com.',
        ResultIP: '8.8.8.8',
        ClientIP: '192.168.2.102',
        Expiration: 123
      })

      server.create('dnslogprivacylist', { ip: '192.168.1.1' })
      server.create('dnslogprivacylist', { ip: '192.168.1.101' })
      server.create('dnslogdomainignorelist', { domain: 'example.com' })
      server.create('dnslogdomainignorelist', { domain: 'privatedomain.com' })
    },
    routes() {
      // TODO hook for all
      const authOK = (request) => {
        try {
          let [type, b64auth] = request.requestHeaders.Authorization.split(' ')
          return type == 'Basic' && atob(b64auth) == 'admin:admin'
        } catch (err) {
          return false
        }
      }

      this.get('/status', (schema, request) => {
        return authOK(request) ? '"Online"' : '"Error"'
      })

      this.get('/devices', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return schema.devices.all().models
      })

      this.put('/device/:id', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let MAC = request.params.id
        let dev = schema.devices.findBy({ MAC })
        let attrs = JSON.parse(request.requestBody)

        if (dev) {
          dev.update(attrs)
          return dev
        } else {
          let _dev = {
            MAC,
            Name: attrs.Name,
            PSKEntry: attrs.PSKEntry,
            Zones: [],
            DeviceTags: []
          }
          return schema.devices.create(_dev)
        }
      })

      this.get('/zones', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return schema.zones.all().models
      })

      this.del('/device/:id', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let id = request.params.id
        return schema.devices.findBy({ MAC: id }).destroy()
      })

      this.get('/pendingPSK', (schema, request) => {
        return false
      })

      this.get('/arp', (schema, request) => {
        return [
          {
            IP: '192.168.2.101',
            HWType: '0x1',
            Flags: '0x6',
            MAC: '11:11:11:11:11:11',
            Mask: '*',
            Device: 'wlan1.4096'
          },
          {
            IP: '192.168.2.102',
            HWType: '0x1',
            Flags: '0x6',
            MAC: '22:22:22:22:22:22',
            Mask: '*',
            Device: 'wlan1.4097'
          }
        ]
      })

      this.get('/nfmap/:id', (schema, request) => {
        let id = request.params.id
        if (id.match(/(lan|internet|dns|dhcp)_access/)) {
          return {
            nftables: [{}, { map: { elem: ['wifi0', 'eth0'], type: 'zz' } }]
          }
        }

        return {}
      })

      this.get('/ip/addr', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return [
          {
            ifindex: 1,
            ifname: 'eth0',
            flags: ['BROADCAST'],
            mtu: 0,
            qdisc: 'string',
            operstate: 'UP',
            group: 'default',
            txqlen: 1000,
            link_type: 'ether',
            address: '00:11:00:11:00:11',
            broadcast: 'ff:ff:ff:ff:ff:ff',
            addr_info: [
              {
                family: 'inet4',
                local: '192.168.0.1',
                prefixlen: 24,
                scope: 'global',
                valid_life_time: 4294967295,
                preferred_life_time: 'preferred_life_time'
              }
            ]
          },
          {
            ifindex: 2,
            ifname: 'wlan0',
            flags: ['BROADCAST'],
            mtu: 0,
            qdisc: 'string',
            operstate: 'UP',
            group: 'default',
            txqlen: 1000,
            link_type: 'ether',
            address: '11:22:33:44:55:66',
            broadcast: 'ff:ff:ff:ff:ff:ff',
            addr_info: [
              {
                family: 'inet4',
                local: '192.168.2.1',
                prefixlen: 24,
                scope: 'global',
                valid_life_time: 4294967295,
                preferred_life_time: 'preferred_life_time'
              }
            ]
          }
        ]
      })

      this.get('/iptraffic', (schema) => {
        const rIP = () => `${r(255)}.${r(255)}.${r(255)}.${r(255)}`
        const rInterface = () => rpick(['wlan0', 'wlan.4096', 'wlan.4097'])

        let ips = schema.devices.all().models.map((dev) => dev.RecentIP)

        let result = []
        for (let x = 0; x < 1024; x++) {
          let Interface = rInterface()
          let Src = rpick(ips)
          let Dst = ['wlan0'].includes(Interface) ? rpick(ips) : rIP()

          let row = {
            Interface,
            Src,
            Dst,
            Packets: r(4096),
            Bytes: r(1e6)
          }

          result.push(row)
        }

        return result
      })

      this.get('/traffic/incoming_traffic_wan', (schema) => {
        return [
          { IP: '192.168.2.101', Packets: 1796468, Bytes: 2203937574 },
          { IP: '192.168.2.102', Packets: 326682, Bytes: 417682716 }
        ]
      })

      this.get('/traffic/outgoing_traffic_wan', (schema) => {
        return [
          { IP: '192.168.2.101', Packets: 428534, Bytes: 62337288 },
          { IP: '192.168.2.102', Packets: 157634, Bytes: 20972708 }
        ]
      })

      this.get('/traffic/incoming_traffic_lan', (schema) => {
        return [
          { IP: '192.168.2.101', Packets: 1, Bytes: 84 },
          { IP: '192.168.2.102', Packets: 2, Bytes: 168 }
        ]
      })

      this.get('/traffic/outgoing_traffic_lan', (schema) => {
        return [
          { IP: '192.168.2.101', Packets: 4, Bytes: 336 },
          { IP: '192.168.2.102', Packets: 8, Bytes: 678 }
        ]
      })

      this.get('/traffic_history', (schema) => {
        const rSizeMB = (n = 1) => n * 1e6 + r(n) * r(1e6)
        const rSizekB = () => 1e3 + r(1e3)
        const rSizeb = () => r(1e3)
        const rSize = () => (r(2) ? rSizeMB() : rSizekB())

        let ips = schema.devices.all().models.map((dev) => dev.RecentIP)
        ips = ips.slice(0, 6)
        let result = []
        for (let x = 0; x < 1024; x++) {
          let serie = {}

          for (let ip of ips) {
            let small = [
              '192.168.2.103',
              '192.168.2.104',
              '192.168.2.105'
            ].includes(ip)

            let large = ['192.168.2.102'].includes(ip) && x > 100 && x < 500

            serie[ip] = {
              LanIn: r(4) % 4 ? 0 : rSizeb(),
              LanOut: rSizekB(),
              WanIn: small ? rSizekB() : rSizeMB(large ? 10 + r(100) : r(5)),
              WanOut: small ? rSizekB() : rSizeMB(r(5))
            }
          }

          result.push(serie)
        }

        return result
      })

      this.get('/hostapd/config', (schema) => {
        return '"testconfig"'
      })

      this.get('/hostapd/status', (schema) => {
        return {
          'ssid[0]': 'TestAP',
          channel: 36
        }
      })
      this.get('/hostapd/all_stations', (schema) => {
        return {
          '11:22:33:44:55:61': {
            AKMSuiteSelector: '00-0f-ac-2',
            aid: '3',
            capability: '0x11',
            connected_time: '4946',
            dot11RSNAStatsSTAAddress: '11:22:33:44:55:61',
            dot11RSNAStatsSelectedPairwiseCipher: '00-0f-ac-4',
            dot11RSNAStatsTKIPLocalMICFailures: '0',
            dot11RSNAStatsTKIPRemoteMICFailures: '0',
            dot11RSNAStatsVersion: '1',
            flags: '[AUTH][ASSOC][AUTHORIZED][WMM][HT]',
            hostapdWPAPTKGroupState: '0',
            hostapdWPAPTKState: '11',
            ht_caps_info: '0x016e',
            ht_mcs_bitmask: 'ff000000000000000000',
            inactive_msec: '1584',
            listen_interval: '1',
            rx_bytes: '126055',
            rx_packets: '2394',
            rx_rate_info: '60',
            signal: '-85',
            supported_rates: '8c 12 98 24 b0 48 60 6c',
            timeout_next: 'NULLFUNC POLL',
            tx_bytes: '485584',
            tx_packets: '1957',
            tx_rate_info: '1200 mcs 5 shortGI',
            vlan_id: '4247',
            wpa: '2'
          },
          '11:22:33:44:55:62': {
            AKMSuiteSelector: '00-0f-ac-2',
            aid: '3',
            capability: '0x11',
            connected_time: '4946',
            dot11RSNAStatsSTAAddress: '11:22:33:44:55:61',
            dot11RSNAStatsSelectedPairwiseCipher: '00-0f-ac-4',
            dot11RSNAStatsTKIPLocalMICFailures: '0',
            dot11RSNAStatsTKIPRemoteMICFailures: '0',
            dot11RSNAStatsVersion: '1',
            flags: '[AUTH][ASSOC][AUTHORIZED][WMM][HT]',
            hostapdWPAPTKGroupState: '0',
            hostapdWPAPTKState: '11',
            ht_caps_info: '0x016e',
            ht_mcs_bitmask: 'ff000000000000000000',
            inactive_msec: '1584',
            listen_interval: '1',
            rx_bytes: '126055',
            rx_packets: '2394',
            rx_rate_info: '60',
            signal: '-85',
            supported_rates: '8c 12 98 24 b0 48 60 6c',
            timeout_next: 'NULLFUNC POLL',
            tx_bytes: '485584',
            tx_packets: '1957',
            tx_rate_info: '1200 mcs 5 shortGI',
            vlan_id: '4247',
            wpa: '2'
          }
        }
      })

      //DNS plugin
      this.get('/plugins/dns/block/config', (schema, request) => {
        return {
          BlockLists: schema.dnsblocklists.all().models,
          BlockDomains: schema.dnsoverrides.where({ Type: 'block' }).models,
          PermitDomains: schema.dnsoverrides.where({ Type: 'permit' }).models,
          ClientIPExclusions: null
        }
      })

      this.get('/plugins/dns/block/metrics', (schema, request) => {
        return { TotalQueries: 65534, BlockedQueries: 4096 }
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
        return schema.dnsblocklists.findBy({ URI }).destroy()
      })

      this.put('/plugins/dns/block/override', (schema, request) => {
        let attrs = JSON.parse(request.requestBody)
        return schema.dnsoverrides.create(attrs)
      })

      this.delete('/plugins/dns/block/override', (schema, request) => {
        let attrs = JSON.parse(request.requestBody)
        let Domain = attrs.Domain
        return schema.dnsoverrides.findBy({ Domain }).destroy()
      })

      this.get('/plugins/dns/block/dump_domains', (schema, request) => {
        return [
          '_thums.ero-advertising.com.',
          '0.fls.doubleclick.net.',
          '0.r.msn.com.',
          '0.start.bz.',
          '0.up.qingdaonews.com.'
        ]
      })

      this.get('/plugins/dns/log/config', (schema, request) => {
        return {
          HostPrivacyIPList: schema.dnslogprivacylists.all().models,
          DomainIgnoreList: schema.dnslogdomainignorelists.all().models
        }
      })

      this.get('/plugins/dns/log/host_privacy_list', (schema, request) => {
        //return ['192.168.1.1', '192.168.1.2']
        return schema.dnslogprivacylists.all().models.map((d) => d.ip)
      })

      this.get('/plugins/dns/log/domain_ignores', (schema, request) => {
        //return ["example.dev", "example.com"]
        return schema.dnslogdomainignorelists.all().models.map((d) => d.domain)
      })

      this.get('/plugins/dns/log/history/:ip', (schema, request) => {
        let types = ['NOERROR', 'NODATA', 'OTHERERROR', 'BLOCKED']
        let ip = request.params.ip //192.168.2.101
        let revip = ip.split('').reverse().join('')
        let day = 1 + parseInt(Math.random() * 28)
        day = day.toString().padStart(2, '0')
        return [
          {
            Q: [
              {
                Name: `${revip}.in-addr.arpa.`,
                Qtype: 12,
                Qclass: 1
              }
            ],
            A: [
              {
                Hdr: {
                  Name: `${revip}.in-addr.arpa.`,
                  Rrtype: 12,
                  Class: 1,
                  Ttl: 30,
                  Rdlength: 0
                },
                Ptr: 'rpi4.lan.'
              }
            ],
            Type: 'NOERROR',
            FirstName: `${revip}.in-addr.arpa.`,
            FirstAnswer: 'rpi4.lan.',
            Local: '[::]:53',
            Remote: `${ip}:50862`,
            Timestamp: `2022-03-${day}T08:05:34.983138386Z`
          },
          {
            Q: [
              {
                Name: 'caldav.fe.apple-dns.net.',
                Qtype: 65,
                Qclass: 1
              }
            ],
            A: [],
            Type: 'NODATA',
            FirstName: 'caldav.fe.apple-dns.net.',
            FirstAnswer: '',
            Local: '[::]:53',
            Remote: `${ip}:50216`,
            Timestamp: `2022-03-${day}T08:05:34.01579228Z`
          },
          {
            Q: [
              {
                Name: `lb._dns-sd._udp.${revip}.in-addr.arpa.`,
                Qtype: 12,
                Qclass: 1
              }
            ],
            A: [],
            Type: 'OTHERERROR',
            FirstName: `lb._dns-sd._udp.${revip}.in-addr.arpa.`,
            FirstAnswer: '',
            Local: '[::]:53',
            Remote: `${ip}:64151`,
            Timestamp: `2022-03-${day}T08:05:29.976935196Z`
          }
        ]
      })
    }
  })

  try {
    if (jest !== undefined) {
      server.logging = false
    }
  } catch (err) {}

  return server
}
