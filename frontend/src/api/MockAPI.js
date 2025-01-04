import { createServer, Model, Response } from 'miragejs'
import { Base64 } from 'utils'

import { wifiAuthFail, nftDrop, authFail } from 'api/mock/alertbucket'

import * as jsonpath from 'jsonpath'

let server = null
let opts = {}

// helper function for random and random value in array
const r = (n) => parseInt(Math.random() * n)
const rpick = (l) => l[parseInt(r(l.length))]

// TODO alot of this can be parsed from OpenAPI definitions
export default function MockAPI(props = null) {
  if (props) {
    opts = { ...props }
  }

  if (server) {
    return server
  }

  server = createServer({
    models: {
      devices: Model,
      groups: Model,
      dnsblocklist: Model,
      dnsoverride: Model,
      dnslogprivacylist: Model,
      dnslogdomainignorelist: Model,
      wireguardpeer: Model,
      plugin: Model,
      forwardrule: Model,
      blockrule: Model,
      forwardblockrule: Model,
      serviceport: Model,
      token: Model,
      backup: Model,
      pfwBlockRule: Model,
      pfwTagRule: Model,
      pfwForwardRule: Model,
      vpnSite: Model,
      uplink: Model,
      tinynets: Model
    },
    seeds(server) {
      server.create('device', {
        Name: 'rpi4',
        MAC: '11:11:11:11:11:11',
        WGPubKey: 'pubkey',
        VLANTag: 'vlantag',
        RecentIP: '192.168.2.101',
        PSKEntry: {
          Type: 'None',
          Psk: null
        },
        Policies: ['lan', 'wan', 'lan_upstream', 'dns'],
        Groups: [],
        DeviceTags: ['private'],
        Style: {
          Icon: 'Router',
          Color: 'amber'
        }
      })

      server.create('device', {
        Name: 'laptop',
        MAC: '22:22:22:22:22:22',
        WGPubKey: 'pubkey',
        VLANTag: 'vlantag',
        RecentIP: '192.168.2.102',
        PSKEntry: {
          Type: 'wpa2',
          Psk: 'password'
        },
        Policies: ['wan', 'dns'],
        Groups: [],
        DeviceTags: ['private'],
        Style: {
          Icon: 'Laptop',
          Color: 'blueGray'
        }
      })

      let devs = ['phone', 'laptop', 'tv', 'desktop', 'iphone', 'android']

      for (let i = 3; i < devs.length + 3; i++) {
        let Name = devs[i - 3]
        let Icon = Name.match(/phone|android/) ? 'Mobile' : 'Laptop'
        if (Name.match(/tv/)) Icon = 'Tv'
        let Color = rpick([
          'violet',
          'purple',
          'fuchsia',
          'pink',
          'red',
          'tertiary',
          'teal',
          'cyan',
          'blueGray',
          'amber'
        ])

        server.create('device', {
          Name,
          MAC: Array(6).fill(`${i}${i}`).join(':'),
          WGPubKey: 'pubkey',
          //VLANTag: 'vlantag',
          RecentIP: `192.168.2.10${i}`,
          PSKEntry: {
            Type: rpick(['wpa2', 'sae']),
            Psk: `password${i}`
          },
          Policies: ['wan', 'dns'],
          Groups: [rpick(['first_group', 'second_group'])],
          DeviceTags: ['private'],
          Style: {
            Icon,
            Color
          }
        })
      }

      server.create('group', {
        Name: 'testing',
        disabled: false,
        GroupTags: []
      })
      server.create('group', {
        Name: 'testing2',
        disabled: false,
        GroupTags: []
      })
      server.create('group', {
        Name: 'testing3',
        disabled: false,
        GroupTags: []
      })

      server.create('plugin', {
        Name: 'dns-block',
        URI: 'dns/block',
        UnixPath: '/state/dns/dns_block_plugin',
        Enabled: true,
        Plus: false,
        GitURL: '',
        ComposeFilePath: ''
      })
      server.create('plugin', {
        Name: 'dns-log',
        URI: 'dns/log',
        UnixPath: '/state/dns/dns_log_plugin',
        Enabled: true
      })
      server.create('plugin', {
        Name: 'wireguard',
        URI: 'wireguard',
        UnixPath: '/state/wireguard/wireguard_plugin',
        Enabled: true
      })
      server.create('plugin', {
        Name: 'lookup',
        URI: 'lookup',
        UnixPath: '/state/plugin-lookup/lookup_plugin',
        Enabled: true
      })
      server.create('plugin', {
        Name: 'PFW',
        URI: 'pfw',
        UnixPath: '/state/plugins/pfw/socket',
        Enabled: true,
        Plus: true,
        GitURL: 'github.com/spr-networks/pfw_extension',
        ComposeFilePath: 'plugins/plus/pfw_extension/docker-compose.yml'
      })

      server.create('forwardrule', {
        SIface: 'wlan1',
        Protocol: 'tcp',
        SrcIP: '10.10.10.10',
        SrcPort: 22,
        DstIP: '192.168.2.101',
        DstPort: 22
      })
      server.create('forwardrule', {
        Protocol: 'tcp',
        SrcIP: '0.0.0.0/0',
        SrcPort: 80,
        DstIP: '192.168.2.101',
        DstPort: 80
      })

      server.create('blockrule', {
        SrcIP: '0.0.0.0/0',
        DstIP: '192.168.1.102',
        Protocol: 'tcp'
      })

      server.create('forwardblockrule', {
        SrcIP: '1.2.3.4',
        DstPort: '0-65535',
        DstIP: '6.7.8.9/24',
        Protocol: 'tcp'
      })

      server.create('serviceport', {
        Protocol: 'tcp',
        Port: '22',
        UpstreamEnabled: false
      })
      server.create('serviceport', {
        Protocol: 'tcp',
        Port: '80',
        UpstreamEnabled: false
      })
      server.create('serviceport', {
        Protocol: 'tcp',
        Port: '443',
        UpstreamEnabled: false
      })
      server.create('serviceport', {
        Protocol: 'tcp',
        Port: '5201',
        UpstreamEnabled: false
      })

      server.create('dnsblocklist', {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/ads.txt',
        Enabled: true
      })
      server.create('dnsblocklist', {
        URI: 'https://raw.githubusercontent.com/blocklistproject/Lists/master/youtube.txt',
        Enabled: true,
        Tags: ['focus']
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

      server.create('wireguardpeer', {
        PublicKey: 'QX9cpyIY7mh1kuVSBnRHJyyqnJQ6iuHdwqSPviPwdT8=',
        PresharedKey: 'YotzN+tIBiiY+q3FkjRM5nEHq0tXMX6c0tT7ls9516E=',
        AllowedIPs: '192.168.3.2/32',
        Endpoint: '192.168.2.1:51280',
        PersistentKeepalive: 25
      })

      server.create('wireguardpeer', {
        PublicKey: '2woVWXJcMcb/7Kh44bevC1eIQnbYBh9nDWyHc8LqWXY=',
        PresharedKey: '1HyPMEAITlOYoHBLvmYQV2qeWgM3Y5CPLDAZiBEl8HI=',
        AllowedIPs: '192.168.3.3/32',
        Endpoint: '192.168.2.1:51280',
        PersistentKeepalive: 25
      })

      server.create('token', {
        Name: 'TokenTest',
        Token: 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQQo=',
        Expire: 0
      })

      server.create('token', {
        Name: 'TokenTest2',
        Token: 'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQgo=',
        Expire: 0
      })

      server.create('backup', {
        Name: 'spr-configs-v0.1.0-beta.0.tgz',
        Timestamp: Date.now()
      })

      server.create('tinynet', { Subnet: '192.168.2.0/24' })

      server.create('pfwBlockRule', {
        RuleName: 'Always block',
        Client: { Identity: '', Group: '', SrcIP: '0.0.0.0', Tag: '' },
        Time: {
          CronExpr: '',
          Start: '',
          End: '',
          Days: [0, 0, 0, 0, 0, 0, 0]
        },
        Expiration: 0,
        Condition: '',
        Disabled: false,
        Protocol: 'tcp',
        Dst: { IP: '213.24.76.23' },
        DstPort: '0-65535'
      })

      server.create('pfwTagRule', {
        RuleName: 'Set focus mode, midnight - 6pm',
        Client: {
          Identity: '',
          Group: '',
          SrcIP: '192.168.2.14',
          Tag: ''
        },
        Time: {
          CronExpr: '',
          Start: '00:00',
          End: '18:00',
          Days: [0, 1, 1, 1, 1, 1, 0]
        },
        Expiration: 0,
        Condition: '',
        Disabled: false,
        Tags: ['focus']
      })

      server.create('vpnSite', {
        Address: '1.1.1.23',
        PeerPublicKey: 'AAAA',
        PrivateKey: 'bbbb',
        PresharedKey: 'CCCC',
        Endpoint: '1.1.1.2:12345'
      })
    },
    routes() {
      // TODO hook for all
      const authOK = (request) => {
        return true //TODO
        if (opts.isSetup) {
          //TODO urls: /setup , /ip/addr and others used
          return true
        }
        try {
          let [type, b64auth] = request.requestHeaders.Authorization?.split(' ')
          return (
            type == 'Basic' && b64auth && Base64.atob(b64auth) == 'admin:admin'
          )
        } catch (err) {
          console.error('B64 err:', err)
          return false
        }
      }

      this.get('/setup', (schema, request) => {
        if (opts.isSetup) {
          return { status: 'ok' }
        }

        return new Response(400, {}, { error: 'already set up' })
      })

      this.put('/setup', (schema, request) => {
        //if (opts.isSetup) {}
        return { status: 'ok' }
        //return new Response(400, {}, { error: 'already set up' })
      })

      this.put('/setup_done', (schema, request) => {
        return { status: 'ok' }
      })

      this.put('/hostapd/restart_setup', (schema, request) => {
        return { status: 'ok' }
      })

      this.put('/hostapd/:iface/:action', (schema, request) => {
        //action==enable|config
        return { status: 'ok' }
      })

      this.put('/link/config', (schema, request) => {
        return { status: 'ok' }
      })

      this.get('/status', (schema, request) => {
        return authOK(request) ? '"Online"' : '"Error"'
      })

      this.get('/devices', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let devices = schema.devices.all().models
        let res = {}
        for (let d of devices) {
          res[d.MAC] = d
        }

        return res
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
            Groups: [],
            DeviceTags: []
          }

          return schema.devices.create(_dev)
        }
      })

      this.put('/device', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let ups = new URLSearchParams(request.url.replace(/^\/device/, ''))
        let id = ups.get('identity')
        let copy = ups.get('copy')

        let MAC = copy || id

        let dev = schema.devices.findBy({ MAC })
        let attrs = JSON.parse(request.requestBody)

        if (copy) {
          let _dev = { ...attrs, PSKEntry: dev.PSKEntry, DeviceTags: [] }

          return schema.devices.create(_dev)
        } else if (dev) {
          dev.update(attrs)
          return schema.devices.findBy({ MAC }).attrs
        } else {
          let PSKEntry = attrs.PSKEntry || { Type: 'sae' }
          if (!PSKEntry.Psk) {
            PSKEntry.Psk = 'password'
          }

          let _dev = {
            Name: 'newdevice',
            MAC: '11:11:11:11:11:23',
            WGPubKey: 'pubkey',
            VLANTag: 'vlantag',
            RecentIP: '192.168.2.123',
            PSKEntry: {
              Type: 'sae',
              Psk: 'password'
            },
            Policies: ['lan', 'dns'],
            Groups: [],
            DeviceTags: ['private'],
            Style: {
              Icon: 'Laptop',
              Color: 'blueGray'
            },
            ...attrs
          }

          schema.devices.create(_dev)
          return _dev
        }
      })

      this.del('/device/:id', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let id = request.params.id
        return schema.devices.findBy({ MAC: id }).destroy()
      })

      this.del('/device', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let ups = new URLSearchParams(request.url.replace(/^\/device/, ''))
        let id = ups.get('identity')

        return schema.devices.findBy({ MAC: id }).destroy()
      })

      this.get('/interfacesConfiguration', (schema, request) => {
        return [
          {
            Name: 'eth0',
            Type: 'Uplink',
            Enabled: true
          },
          {
            Name: 'wlan1',
            Type: 'AP',
            Enabled: true
          },
          {
            Name: 'ppp0',
            Type: 'Uplink',
            Enabled: true
          },
          {
            Name: 'eth0.123',
            Type: 'Other',
            Enabled: true
          }
        ]
      })

      this.get('/groups', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return schema.groups.all().models
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

      this.get('/info/dockernetworks', (schema, request) => {
        return [
          {
            Name: 'none',
            Id: '0af4adec2d12a0429f0146259b0a4a8a2ba1a4a2749683b06d1bad065bae6923',
            Created: '2023-11-16T17:27:11.145807881Z',
            Scope: 'local',
            Driver: 'null',
            EnableIPv6: false,
            IPAM: {
              Driver: 'default',
              Options: null,
              Config: []
            },
            Internal: false,
            Attachable: false,
            Ingress: false,
            ConfigFrom: {
              Network: ''
            },
            ConfigOnly: false,
            Containers: {},
            Options: {},
            Labels: {}
          },
          {
            Name: 'spr-mitmproxy_mitmnet',
            Id: '35dea03471420e9b1913b4046bf2d3983ff81505693d637a080127d6474eb802',
            Created: '2023-11-17T03:32:38.507735167Z',
            Scope: 'local',
            Driver: 'bridge',
            EnableIPv6: false,
            IPAM: {
              Driver: 'default',
              Options: null,
              Config: [
                {
                  Subnet: '172.19.0.0/16',
                  Gateway: '172.19.0.1'
                }
              ]
            },
            Internal: false,
            Attachable: false,
            Ingress: false,
            ConfigFrom: {
              Network: ''
            },
            ConfigOnly: false,
            Containers: {},
            Options: {
              'com.docker.network.bridge.name': 'mitmweb0'
            },
            Labels: {
              'com.docker.compose.network': 'mitmnet',
              'com.docker.compose.project': 'spr-mitmproxy',
              'com.docker.compose.version': '2.21.0'
            }
          },
          {
            Name: 'host',
            Id: '78ab816140fe23ba86c5ed5ba5e1d64fcecf063df07346d609ab8cd519dfbc94',
            Created: '2023-11-16T17:27:11.194437585Z',
            Scope: 'local',
            Driver: 'host',
            EnableIPv6: false,
            IPAM: {
              Driver: 'default',
              Options: null,
              Config: []
            },
            Internal: false,
            Attachable: false,
            Ingress: false,
            ConfigFrom: {
              Network: ''
            },
            ConfigOnly: false,
            Containers: {},
            Options: {},
            Labels: {}
          },
          {
            Name: 'bridge',
            Id: '43a43805e2386fcc05130baa145f4291b901de2c8b6eae24ad286316e70f6416',
            Created: '2023-11-25T09:02:59.603700795Z',
            Scope: 'local',
            Driver: 'bridge',
            EnableIPv6: false,
            IPAM: {
              Driver: 'default',
              Options: null,
              Config: [
                {
                  Subnet: '172.17.0.0/16',
                  Gateway: '172.17.0.1'
                }
              ]
            },
            Internal: false,
            Attachable: false,
            Ingress: false,
            ConfigFrom: {
              Network: ''
            },
            ConfigOnly: false,
            Containers: {},
            Options: {
              'com.docker.network.bridge.default_bridge': 'true',
              'com.docker.network.bridge.enable_icc': 'true',
              'com.docker.network.bridge.enable_ip_masquerade': 'false',
              'com.docker.network.bridge.host_binding_ipv4': '0.0.0.0',
              'com.docker.network.bridge.name': 'docker0',
              'com.docker.network.driver.mtu': '1500'
            },
            Labels: {}
          }
        ]
      })

      this.get('/nfmap/:id', (schema, request) => {
        let id = request.params.id
        if (id.match(/(lan|internet|dns|dhcp)_access/)) {
          return {
            nftables: [{}, { map: { elem: ['wifi0', 'eth0'], type: 'zz' } }]
          }
        } else if (id == 'ethernet_filter') {
          return {
            nftables: [
              {
                metainfo: {
                  version: '1.0.6',
                  release_name: 'Lester Gooch #5',
                  json_schema_version: 1
                }
              },
              {
                map: {
                  family: 'inet',
                  name: 'ethernet_filter',
                  table: 'filter',
                  type: ['ipv4_addr', 'ifname', 'ether_addr'],
                  handle: 20,
                  map: 'verdict',
                  elem: [
                    [
                      {
                        concat: [
                          '192.168.2.101',
                          'wlan1.4096',
                          '11:11:11:11:11:11'
                        ]
                      },
                      {
                        return: null
                      }
                    ],
                    [
                      {
                        concat: [
                          '192.168.2.102',
                          'wlan1.4097',
                          '22:22:22:22:22:22'
                        ]
                      },
                      {
                        return: null
                      }
                    ]
                  ]
                }
              }
            ]
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
                family: 'inet',
                local: '192.168.22.22',
                prefixlen: 24,
                scope: 'global',
                valid_life_time: 4294967295,
                preferred_life_time: 'preferred_life_time'
              }
            ]
          },
          {
            ifindex: 3,
            ifname: 'wlan1',
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
                family: 'inet',
                local: '192.168.2.1',
                prefixlen: 24,
                scope: 'global',
                valid_life_time: 4294967295,
                preferred_life_time: 'preferred_life_time'
              }
            ]
          },
          {
            ifindex: 4,
            ifname: 'ppp0',
            flags: ['BROADCAST'],
            mtu: 0,
            qdisc: 'string',
            operstate: 'UP',
            group: 'default',
            txqlen: 1000,
            link_type: 'ether',
            address: '00:11:00:11:00:33',
            broadcast: 'ff:ff:ff:ff:ff:ff',
            addr_info: [
              {
                family: 'inet',
                local: '11.22.33.44',
                prefixlen: 24,
                scope: 'global',
                valid_life_time: 4294967295,
                preferred_life_time: 'preferred_life_time'
              }
            ]
          },
          {
            ifindex: 5,
            ifname: 'eth0.123',
            flags: ['BROADCAST'],
            mtu: 0,
            qdisc: 'string',
            operstate: 'UP',
            group: 'default',
            txqlen: 1000,
            link_type: 'ether',
            address: '00:22:00:11:00:11',
            broadcast: 'ff:ff:ff:ff:ff:ff',
            addr_info: [
              {
                family: 'inet',
                local: '192.168.99.99',
                prefixlen: 24,
                scope: 'global',
                valid_life_time: 4294967295,
                preferred_life_time: 'preferred_life_time'
              }
            ]
          }
        ]
      })

      this.get('/iw/list', (schema) => {
        return [
          {
            wiphy: 'phy0',
            wiphy_index: 0,
            max_scan_ssids: 4,
            max_scan_ies_length: '2243 bytes',
            max_sched_scan_ssids: 0,
            max_match_sets: 0,
            retry_short_limit: 7,
            retry_long_limit: 4,
            coverage_class: '0 (up to 0m)',
            device_supports: ['RSN-IBSS', 'AP-side u-APSD', 'T-DLS'],
            supported_ciphers: [
              'WEP40 (00-0f-ac:1)',
              'WEP104 (00-0f-ac:5)',
              'TKIP (00-0f-ac:2)',
              'CCMP-128 (00-0f-ac:4)',
              'CCMP-256 (00-0f-ac:10)',
              'GCMP-128 (00-0f-ac:8)',
              'GCMP-256 (00-0f-ac:9)',
              'CMAC (00-0f-ac:6)',
              'CMAC-256 (00-0f-ac:13)',
              'GMAC-128 (00-0f-ac:11)',
              'GMAC-256 (00-0f-ac:12)',
              'Available Antennas: TX 0x3 RX 0x3',
              'Configured Antennas: TX 0x3 RX 0x3'
            ],
            bands: [
              {
                band: 'Band 1',
                capabilities: [
                  '0x1ff',
                  'RX LDPC',
                  'HT20/HT40',
                  'SM Power Save disabled',
                  'RX Greenfield',
                  'RX HT20 SGI',
                  'RX HT40 SGI',
                  'TX STBC',
                  'RX STBC 1-stream',
                  'Max AMSDU length: 3839 bytes',
                  'No DSSS/CCK HT40',
                  'Maximum RX AMPDU length 65535 bytes (exponent: 0x003)',
                  'Minimum RX AMPDU time spacing: No restriction (0x00)',
                  'HT TX/RX MCS rate indexes supported: 0-15'
                ],
                bitrates: [
                  '1.0 Mbps (short preamble supported)',
                  '2.0 Mbps (short preamble supported)',
                  '5.5 Mbps (short preamble supported)',
                  '11.0 Mbps (short preamble supported)',
                  '6.0 Mbps',
                  '9.0 Mbps',
                  '12.0 Mbps',
                  '18.0 Mbps',
                  '24.0 Mbps',
                  '36.0 Mbps',
                  '48.0 Mbps',
                  '54.0 Mbps'
                ]
              },
              {
                band: 'Band 2',
                frequencies: [
                  '5180 MHz [36] (18.0 dBm)',
                  '5200 MHz [40] (18.0 dBm)',
                  '5220 MHz [44] (18.0 dBm)',
                  '5240 MHz [48] (18.0 dBm)',
                  '5260 MHz [52] (18.0 dBm) (radar detection)',
                  '5280 MHz [56] (18.0 dBm) (radar detection)',
                  '5300 MHz [60] (18.0 dBm) (radar detection)',
                  '5320 MHz [64] (18.0 dBm) (radar detection)',
                  '5500 MHz [100] (18.0 dBm) (radar detection)',
                  '5520 MHz [104] (18.0 dBm) (radar detection)',
                  '5540 MHz [108] (18.0 dBm) (radar detection)',
                  '5560 MHz [112] (18.0 dBm) (radar detection)',
                  '5580 MHz [116] (18.0 dBm) (radar detection)',
                  '5600 MHz [120] (18.0 dBm) (radar detection)',
                  '5620 MHz [124] (18.0 dBm) (radar detection)',
                  '5640 MHz [128] (18.0 dBm) (radar detection)',
                  '5660 MHz [132] (18.0 dBm) (radar detection)',
                  '5680 MHz [136] (18.0 dBm) (radar detection)',
                  '5700 MHz [140] (18.0 dBm) (radar detection)',
                  '5720 MHz [144] (18.0 dBm) (radar detection)',
                  '5745 MHz [149] (18.0 dBm)',
                  '5765 MHz [153] (18.0 dBm)',
                  '5785 MHz [157] (18.0 dBm)',
                  '5805 MHz [161] (18.0 dBm)',
                  '5825 MHz [165] (18.0 dBm)',
                  '5845 MHz [169] (18.0 dBm) (no IR)',
                  '5865 MHz [173] (18.0 dBm) (no IR)'
                ],
                capabilities: [
                  '0x1ff',
                  'RX LDPC',
                  'HT20/HT40',
                  'SM Power Save disabled',
                  'RX Greenfield',
                  'RX HT20 SGI',
                  'RX HT40 SGI',
                  'TX STBC',
                  'RX STBC 1-stream',
                  'Max AMSDU length: 3839 bytes',
                  'No DSSS/CCK HT40',
                  'Maximum RX AMPDU length 65535 bytes (exponent: 0x003)',
                  'Minimum RX AMPDU time spacing: No restriction (0x00)',
                  'HT TX/RX MCS rate indexes supported: 0-15'
                ],
                vht_capabilities: [
                  'Max MPDU length: 3895',
                  'Supported Channel Width: neither 160 nor 80+80',
                  'RX LDPC',
                  'short GI (80 MHz)',
                  'TX STBC',
                  'RX antenna pattern consistency',
                  'TX antenna pattern consistency'
                ],
                vht_rx_mcs_set: [
                  '1 streams: MCS 0-9',
                  '2 streams: MCS 0-9',
                  '3 streams: not supported',
                  '4 streams: not supported',
                  '5 streams: not supported',
                  '6 streams: not supported',
                  '7 streams: not supported',
                  '8 streams: not supported',
                  'VHT RX highest supported: 0 Mbps'
                ],
                vht_tx_mcs_set: [
                  '1 streams: MCS 0-9',
                  '2 streams: MCS 0-9',
                  '3 streams: not supported',
                  '4 streams: not supported',
                  '5 streams: not supported',
                  '6 streams: not supported',
                  '7 streams: not supported',
                  '8 streams: not supported',
                  'VHT TX highest supported: 0 Mbps'
                ],
                bitrates: [
                  '6.0 Mbps',
                  '9.0 Mbps',
                  '12.0 Mbps',
                  '18.0 Mbps',
                  '24.0 Mbps',
                  '36.0 Mbps',
                  '48.0 Mbps',
                  '54.0 Mbps'
                ]
              }
            ],
            supported_interface_modes: [
              'IBSS',
              'managed',
              'AP',
              'AP/VLAN',
              'monitor',
              'mesh point',
              'P2P-client',
              'P2P-GO'
            ],
            supported_commands: [
              'new_interface',
              'set_interface',
              'new_key',
              'start_ap',
              'new_station',
              'new_mpath',
              'set_mesh_config',
              'set_bss',
              'authenticate',
              'associate',
              'deauthenticate',
              'disassociate',
              'join_ibss',
              'join_mesh',
              'remain_on_channel',
              'set_tx_bitrate_mask',
              'frame',
              'frame_wait_cancel',
              'set_wiphy_netns',
              'set_channel',
              'tdls_mgmt',
              'tdls_oper',
              'probe_client',
              'set_noack_map',
              'register_beacons',
              'start_p2p_device',
              'set_mcast_rate',
              'connect',
              'disconnect',
              'channel_switch',
              'set_qos_map',
              'set_multicast_to_unicast'
            ],
            software_interface_modes: ['AP/VLAN', 'monitor'],
            valid_interface_combinations: [
              '#{ IBSS } <= 1, #{ managed, AP, mesh point, P2P-client, P2P-GO } <= 2,',
              'total <= 2, #channels <= 1, STA/AP BI must match'
            ],
            ht_capability_overrides: [
              'MCS: ff ff ff ff ff ff ff ff ff ff',
              'maximum A-MSDU length',
              'supported channel width',
              'short GI for 40 MHz',
              'max A-MPDU length exponent',
              'min MPDU start spacing',
              'Device supports TX status socket option.',
              'Device supports HT-IBSS.',
              'Device supports SAE with AUTHENTICATE command',
              'Device supports low priority scan.',
              'Device supports scan flush.',
              'Device supports AP scan.',
              'Device supports per-vif TX power setting',
              'Driver supports full state transitions for AP/GO clients',
              'Driver supports a userspace MPM',
              'Device supports active monitor (which will ACK incoming frames)',
              'Device supports configuring vdev MAC-addr on create.',
              'max # scan plans: 1',
              'max scan plan interval: -1',
              'max scan plan iterations: 0'
            ],
            supported_tx_frame_types: [
              'IBSS: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'managed: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'AP: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'AP/VLAN: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'mesh point: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'P2P-client: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'P2P-GO: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'P2P-device: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0'
            ],
            supported_rx_frame_types: [
              'IBSS: 0x40 0xb0 0xc0 0xd0',
              'managed: 0x40 0xb0 0xd0',
              'AP: 0x00 0x20 0x40 0xa0 0xb0 0xc0 0xd0',
              'AP/VLAN: 0x00 0x20 0x40 0xa0 0xb0 0xc0 0xd0',
              'mesh point: 0xb0 0xc0 0xd0',
              'P2P-client: 0x40 0xd0',
              'P2P-GO: 0x00 0x20 0x40 0xa0 0xb0 0xc0 0xd0',
              'P2P-device: 0x40 0xd0'
            ],
            supported_extended_features: [
              '[ VHT_IBSS ]: VHT-IBSS',
              '[ RRM ]: RRM',
              '[ FILS_STA ]: STA FILS (Fast Initial Link Setup)',
              '[ CQM_RSSI_LIST ]: multiple CQM_RSSI_THOLD records',
              '[ CONTROL_PORT_OVER_NL80211 ]: control port over nl80211',
              '[ TXQS ]: FQ-CoDel-enabled intermediate TXQs',
              '[ AIRTIME_FAIRNESS ]: airtime fairness scheduling',
              '[ AQL ]: Airtime Queue Limits (AQL)',
              '[ SCAN_RANDOM_SN ]: use random sequence numbers in scans',
              '[ SCAN_MIN_PREQ_CONTENT ]: use probe request with only rate IEs in scans',
              '[ CONTROL_PORT_NO_PREAUTH ]: disable pre-auth over nl80211 control port support',
              '[ DEL_IBSS_STA ]: deletion of IBSS station support',
              '[ SCAN_FREQ_KHZ ]: scan on kHz frequency support',
              '[ CONTROL_PORT_OVER_NL80211_TX_STATUS ]: tx status for nl80211 control port support'
            ]
          },
          {
            wiphy: 'phy1',
            wiphy_index: 1,
            max_scan_ssids: 10,
            max_scan_ies_length: '2048 bytes',
            max_sched_scan_ssids: 16,
            max_match_sets: 16,
            retry_short_limit: 7,
            retry_long_limit: 4,
            coverage_class: '0 (up to 0m)',
            device_supports: ['roaming', 'T-DLS'],
            supported_ciphers: [
              'WEP40 (00-0f-ac:1)',
              'WEP104 (00-0f-ac:5)',
              'TKIP (00-0f-ac:2)',
              'CCMP-128 (00-0f-ac:4)',
              'CMAC (00-0f-ac:6)',
              'Available Antennas: TX 0 RX 0'
            ],
            bands: [
              {
                band: 'Band 1',
                capabilities: [
                  '0x1062',
                  'HT20/HT40',
                  'Static SM Power Save',
                  'RX HT20 SGI',
                  'RX HT40 SGI',
                  'No RX STBC',
                  'Max AMSDU length: 3839 bytes',
                  'DSSS/CCK HT40',
                  'Maximum RX AMPDU length 65535 bytes (exponent: 0x003)',
                  'Minimum RX AMPDU time spacing: 16 usec (0x07)',
                  'HT TX/RX MCS rate indexes supported: 0-7'
                ],
                bitrates: [
                  '1.0 Mbps',
                  '2.0 Mbps (short preamble supported)',
                  '5.5 Mbps (short preamble supported)',
                  '11.0 Mbps (short preamble supported)',
                  '6.0 Mbps',
                  '9.0 Mbps',
                  '12.0 Mbps',
                  '18.0 Mbps',
                  '24.0 Mbps',
                  '36.0 Mbps',
                  '48.0 Mbps',
                  '54.0 Mbps'
                ]
              },
              {
                band: 'Band 2',
                frequencies: [
                  '5170 MHz [34] (disabled)',
                  '5180 MHz [36] (20.0 dBm)',
                  '5190 MHz [38] (disabled)',
                  '5200 MHz [40] (20.0 dBm)',
                  '5210 MHz [42] (disabled)',
                  '5220 MHz [44] (20.0 dBm)',
                  '5230 MHz [46] (disabled)',
                  '5240 MHz [48] (20.0 dBm)',
                  '5260 MHz [52] (20.0 dBm) (no IR, radar detection)',
                  '5280 MHz [56] (20.0 dBm) (no IR, radar detection)',
                  '5300 MHz [60] (20.0 dBm) (no IR, radar detection)',
                  '5320 MHz [64] (20.0 dBm) (no IR, radar detection)',
                  '5500 MHz [100] (20.0 dBm) (no IR, radar detection)',
                  '5520 MHz [104] (20.0 dBm) (no IR, radar detection)',
                  '5540 MHz [108] (20.0 dBm) (no IR, radar detection)',
                  '5560 MHz [112] (20.0 dBm) (no IR, radar detection)',
                  '5580 MHz [116] (20.0 dBm) (no IR, radar detection)',
                  '5600 MHz [120] (20.0 dBm) (no IR, radar detection)',
                  '5620 MHz [124] (20.0 dBm) (no IR, radar detection)',
                  '5640 MHz [128] (20.0 dBm) (no IR, radar detection)',
                  '5660 MHz [132] (20.0 dBm) (no IR, radar detection)',
                  '5680 MHz [136] (20.0 dBm) (no IR, radar detection)',
                  '5700 MHz [140] (20.0 dBm) (no IR, radar detection)',
                  '5720 MHz [144] (20.0 dBm) (no IR, radar detection)',
                  '5745 MHz [149] (20.0 dBm)',
                  '5765 MHz [153] (20.0 dBm)',
                  '5785 MHz [157] (20.0 dBm)',
                  '5805 MHz [161] (20.0 dBm)',
                  '5825 MHz [165] (20.0 dBm)'
                ],
                capabilities: [
                  '0x1062',
                  'HT20/HT40',
                  'Static SM Power Save',
                  'RX HT20 SGI',
                  'RX HT40 SGI',
                  'No RX STBC',
                  'Max AMSDU length: 3839 bytes',
                  'DSSS/CCK HT40',
                  'Maximum RX AMPDU length 65535 bytes (exponent: 0x003)',
                  'Minimum RX AMPDU time spacing: 16 usec (0x07)',
                  'HT TX/RX MCS rate indexes supported: 0-7'
                ],
                vht_capabilities: [
                  'Max MPDU length: 3895',
                  'Supported Channel Width: neither 160 nor 80+80',
                  'short GI (80 MHz)',
                  'SU Beamformee'
                ],
                vht_rx_mcs_set: [
                  '1 streams: MCS 0-9',
                  '2 streams: not supported',
                  '3 streams: not supported',
                  '4 streams: not supported',
                  '5 streams: not supported',
                  '6 streams: not supported',
                  '7 streams: not supported',
                  '8 streams: not supported',
                  'VHT RX highest supported: 0 Mbps'
                ],
                vht_tx_mcs_set: [
                  '1 streams: MCS 0-9',
                  '2 streams: not supported',
                  '3 streams: not supported',
                  '4 streams: not supported',
                  '5 streams: not supported',
                  '6 streams: not supported',
                  '7 streams: not supported',
                  '8 streams: not supported',
                  'VHT TX highest supported: 0 Mbps'
                ],
                bitrates: [
                  '6.0 Mbps',
                  '9.0 Mbps',
                  '12.0 Mbps',
                  '18.0 Mbps',
                  '24.0 Mbps',
                  '36.0 Mbps',
                  '48.0 Mbps',
                  '54.0 Mbps'
                ]
              }
            ],
            supported_interface_modes: [
              'IBSS',
              'managed',
              'AP',
              'P2P-client',
              'P2P-GO',
              'P2P-device'
            ],
            supported_commands: [
              'new_interface',
              'set_interface',
              'new_key',
              'start_ap',
              'join_ibss',
              'set_pmksa',
              'del_pmksa',
              'flush_pmksa',
              'remain_on_channel',
              'frame',
              'set_wiphy_netns',
              'set_channel',
              'tdls_oper',
              'start_sched_scan',
              'start_p2p_device',
              'connect',
              'disconnect',
              'crit_protocol_start',
              'crit_protocol_stop',
              'update_connect_params'
            ],
            valid_interface_combinations: [
              '#{ managed } <= 1, #{ P2P-device } <= 1, #{ P2P-client, P2P-GO } <= 1,',
              'total <= 3, #channels <= 2',
              '#{ managed } <= 1, #{ AP } <= 1, #{ P2P-client } <= 1, #{ P2P-device } <= 1,',
              'total <= 4, #channels <= 1',
              'Device supports scan flush.',
              'Device supports randomizing MAC-addr in sched scans.',
              'max # scan plans: 1',
              'max scan plan interval: 508',
              'max scan plan iterations: 0'
            ],
            supported_tx_frame_types: [
              'managed: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'AP: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'P2P-client: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'P2P-GO: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'P2P-device: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0'
            ],
            supported_rx_frame_types: [
              'managed: 0x40 0xd0',
              'AP: 0x00 0x20 0x40 0xa0 0xb0 0xc0 0xd0',
              'P2P-client: 0x40 0xd0',
              'P2P-GO: 0x00 0x20 0x40 0xa0 0xb0 0xc0 0xd0',
              'P2P-device: 0x40 0xd0'
            ]
          },
          {
            wiphy: 'phy2',
            wiphy_index: 2,
            max_scan_ssids: 4,
            max_scan_ies_length: '2243 bytes',
            max_sched_scan_ssids: 0,
            max_match_sets: 0,
            retry_short_limit: 7,
            retry_long_limit: 4,
            coverage_class: '0 (up to 0m)',
            device_supports: ['RSN-IBSS', 'AP-side u-APSD', 'T-DLS'],
            supported_ciphers: [
              'WEP40 (00-0f-ac:1)',
              'WEP104 (00-0f-ac:5)',
              'TKIP (00-0f-ac:2)',
              'CCMP-128 (00-0f-ac:4)',
              'CCMP-256 (00-0f-ac:10)',
              //'GCMP-128 (00-0f-ac:8)',
              'GCMP-256 (00-0f-ac:9)',
              'CMAC (00-0f-ac:6)',
              'CMAC-256 (00-0f-ac:13)',
              'GMAC-128 (00-0f-ac:11)',
              'GMAC-256 (00-0f-ac:12)',
              'Available Antennas: TX 0x3 RX 0x3',
              'Configured Antennas: TX 0x3 RX 0x3'
            ],
            bands: [
              {
                band: 'Band 1',
                capabilities: [
                  '0x1ff',
                  'RX LDPC',
                  'HT20/HT40',
                  'SM Power Save disabled',
                  'RX Greenfield',
                  'RX HT20 SGI',
                  'RX HT40 SGI',
                  'TX STBC',
                  'RX STBC 1-stream',
                  'Max AMSDU length: 3839 bytes',
                  'No DSSS/CCK HT40',
                  'Maximum RX AMPDU length 65535 bytes (exponent: 0x003)',
                  'Minimum RX AMPDU time spacing: No restriction (0x00)',
                  'HT TX/RX MCS rate indexes supported: 0-15'
                ],
                bitrates: [
                  '1.0 Mbps (short preamble supported)',
                  '2.0 Mbps (short preamble supported)',
                  '5.5 Mbps (short preamble supported)',
                  '11.0 Mbps (short preamble supported)',
                  '6.0 Mbps',
                  '9.0 Mbps',
                  '12.0 Mbps',
                  '18.0 Mbps',
                  '24.0 Mbps',
                  '36.0 Mbps',
                  '48.0 Mbps',
                  '54.0 Mbps'
                ]
              },
              {
                band: 'Band 2',
                frequencies: [
                  '5180 MHz [36] (18.0 dBm)',
                  '5200 MHz [40] (18.0 dBm)',
                  '5220 MHz [44] (18.0 dBm)',
                  '5240 MHz [48] (18.0 dBm)',
                  '5260 MHz [52] (18.0 dBm) (radar detection)',
                  '5280 MHz [56] (18.0 dBm) (radar detection)',
                  '5300 MHz [60] (18.0 dBm) (radar detection)',
                  '5320 MHz [64] (18.0 dBm) (radar detection)',
                  '5500 MHz [100] (18.0 dBm) (radar detection)',
                  '5520 MHz [104] (18.0 dBm) (radar detection)',
                  '5540 MHz [108] (18.0 dBm) (radar detection)',
                  '5560 MHz [112] (18.0 dBm) (radar detection)',
                  '5580 MHz [116] (18.0 dBm) (radar detection)',
                  '5600 MHz [120] (18.0 dBm) (radar detection)',
                  '5620 MHz [124] (18.0 dBm) (radar detection)',
                  '5640 MHz [128] (18.0 dBm) (radar detection)',
                  '5660 MHz [132] (18.0 dBm) (radar detection)',
                  '5680 MHz [136] (18.0 dBm) (radar detection)',
                  '5700 MHz [140] (18.0 dBm) (radar detection)',
                  '5720 MHz [144] (18.0 dBm) (radar detection)',
                  '5745 MHz [149] (18.0 dBm)',
                  '5765 MHz [153] (18.0 dBm)',
                  '5785 MHz [157] (18.0 dBm)',
                  '5805 MHz [161] (18.0 dBm)',
                  '5825 MHz [165] (18.0 dBm)',
                  '5845 MHz [169] (18.0 dBm) (no IR)',
                  '5865 MHz [173] (18.0 dBm) (no IR)'
                ],
                capabilities: [
                  '0x1ff',
                  'RX LDPC',
                  'HT20/HT40',
                  'SM Power Save disabled',
                  'RX Greenfield',
                  'RX HT20 SGI',
                  'RX HT40 SGI',
                  'TX STBC',
                  'RX STBC 1-stream',
                  'Max AMSDU length: 3839 bytes',
                  'No DSSS/CCK HT40',
                  'Maximum RX AMPDU length 65535 bytes (exponent: 0x003)',
                  'Minimum RX AMPDU time spacing: No restriction (0x00)',
                  'HT TX/RX MCS rate indexes supported: 0-15'
                ],
                vht_capabilities: [
                  'Max MPDU length: 3895',
                  'Supported Channel Width: neither 160 nor 80+80',
                  'RX LDPC',
                  'short GI (80 MHz)',
                  'TX STBC',
                  'RX antenna pattern consistency',
                  'TX antenna pattern consistency'
                ],
                vht_rx_mcs_set: [
                  '1 streams: MCS 0-9',
                  '2 streams: MCS 0-9',
                  '3 streams: not supported',
                  '4 streams: not supported',
                  '5 streams: not supported',
                  '6 streams: not supported',
                  '7 streams: not supported',
                  '8 streams: not supported',
                  'VHT RX highest supported: 0 Mbps'
                ],
                vht_tx_mcs_set: [
                  '1 streams: MCS 0-9',
                  '2 streams: MCS 0-9',
                  '3 streams: not supported',
                  '4 streams: not supported',
                  '5 streams: not supported',
                  '6 streams: not supported',
                  '7 streams: not supported',
                  '8 streams: not supported',
                  'VHT TX highest supported: 0 Mbps'
                ],
                bitrates: [
                  '6.0 Mbps',
                  '9.0 Mbps',
                  '12.0 Mbps',
                  '18.0 Mbps',
                  '24.0 Mbps',
                  '36.0 Mbps',
                  '48.0 Mbps',
                  '54.0 Mbps'
                ]
              }
            ],
            supported_interface_modes: [
              'IBSS',
              'managed',
              'AP',
              'AP/VLAN',
              'monitor',
              'mesh point',
              'P2P-client',
              'P2P-GO'
            ],
            supported_commands: [
              'new_interface',
              'set_interface',
              'new_key',
              'start_ap',
              'new_station',
              'new_mpath',
              'set_mesh_config',
              'set_bss',
              'authenticate',
              'associate',
              'deauthenticate',
              'disassociate',
              'join_ibss',
              'join_mesh',
              'remain_on_channel',
              'set_tx_bitrate_mask',
              'frame',
              'frame_wait_cancel',
              'set_wiphy_netns',
              'set_channel',
              'tdls_mgmt',
              'tdls_oper',
              'probe_client',
              'set_noack_map',
              'register_beacons',
              'start_p2p_device',
              'set_mcast_rate',
              'connect',
              'disconnect',
              'channel_switch',
              'set_qos_map',
              'set_multicast_to_unicast'
            ],
            software_interface_modes: ['AP/VLAN', 'monitor'],
            valid_interface_combinations: [
              '#{ IBSS } <= 1, #{ managed, AP, mesh point, P2P-client, P2P-GO } <= 2,',
              'total <= 2, #channels <= 1, STA/AP BI must match'
            ],
            ht_capability_overrides: [
              'MCS: ff ff ff ff ff ff ff ff ff ff',
              'maximum A-MSDU length',
              'supported channel width',
              'short GI for 40 MHz',
              'max A-MPDU length exponent',
              'min MPDU start spacing',
              'Device supports TX status socket option.',
              'Device supports HT-IBSS.',
              'Device supports SAE with AUTHENTICATE command',
              'Device supports low priority scan.',
              'Device supports scan flush.',
              'Device supports AP scan.',
              'Device supports per-vif TX power setting',
              'Driver supports full state transitions for AP/GO clients',
              'Driver supports a userspace MPM',
              'Device supports active monitor (which will ACK incoming frames)',
              'Device supports configuring vdev MAC-addr on create.',
              'max # scan plans: 1',
              'max scan plan interval: -1',
              'max scan plan iterations: 0'
            ],
            supported_tx_frame_types: [
              'IBSS: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'managed: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'AP: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'AP/VLAN: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'mesh point: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'P2P-client: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'P2P-GO: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0',
              'P2P-device: 0x00 0x10 0x20 0x30 0x40 0x50 0x60 0x70 0x80 0x90 0xa0 0xb0 0xc0 0xd0 0xe0 0xf0'
            ],
            supported_rx_frame_types: [
              'IBSS: 0x40 0xb0 0xc0 0xd0',
              'managed: 0x40 0xb0 0xd0',
              'AP: 0x00 0x20 0x40 0xa0 0xb0 0xc0 0xd0',
              'AP/VLAN: 0x00 0x20 0x40 0xa0 0xb0 0xc0 0xd0',
              'mesh point: 0xb0 0xc0 0xd0',
              'P2P-client: 0x40 0xd0',
              'P2P-GO: 0x00 0x20 0x40 0xa0 0xb0 0xc0 0xd0',
              'P2P-device: 0x40 0xd0'
            ],
            supported_extended_features: [
              '[ VHT_IBSS ]: VHT-IBSS',
              '[ RRM ]: RRM',
              '[ FILS_STA ]: STA FILS (Fast Initial Link Setup)',
              '[ CQM_RSSI_LIST ]: multiple CQM_RSSI_THOLD records',
              '[ CONTROL_PORT_OVER_NL80211 ]: control port over nl80211',
              '[ TXQS ]: FQ-CoDel-enabled intermediate TXQs',
              '[ AIRTIME_FAIRNESS ]: airtime fairness scheduling',
              '[ AQL ]: Airtime Queue Limits (AQL)',
              '[ SCAN_RANDOM_SN ]: use random sequence numbers in scans',
              '[ SCAN_MIN_PREQ_CONTENT ]: use probe request with only rate IEs in scans',
              '[ CONTROL_PORT_NO_PREAUTH ]: disable pre-auth over nl80211 control port support',
              '[ DEL_IBSS_STA ]: deletion of IBSS station support',
              '[ SCAN_FREQ_KHZ ]: scan on kHz frequency support',
              '[ CONTROL_PORT_OVER_NL80211_TX_STATUS ]: tx status for nl80211 control port support'
            ]
          }
        ]
      })

      this.get('/features', () => {
        return ['dns', 'wifi', 'ppp', 'wireguard']
      })

      this.get('/version', () => {
        return '"1.0"'
      })

      this.get('/dockerPS', () => {
        return '{"Command":"\\"/bin/sh -c /scripts…\\"","CreatedAt":"2024-10-07 18:31:59 +0000 UTC","ExitCode":0,"Health":"","ID":"a720a74de915","Image":"ghcr.io/spr-networks/super_wifid:latest","Labels":"org.supernetworks.ci=true,org.supernetworks.version=1.0.0,com.docker.compose.config-hash=4e49328bc88bfe331c914d70a838bfd858fe425dc050e2304790a97c8146cf2b,com.docker.compose.container-number=1,com.docker.compose.oneoff=False,com.docker.compose.project=super,com.docker.compose.replace=da075df406ce9c78f57cdecd96f827d78ce5c765d337ce3e08c469f97a5310d9,com.docker.compose.version=2.29.1,com.docker.compose.depends_on=api:service_started:false,dhcp:service_started:false,multicast_udp_proxy:service_started:false,com.docker.compose.image=sha256:70e6e4accc180149637409c8c41062cb8e51a3dda74e1b2c22c4884a4920cf70,com.docker.compose.project.config_files=/home/spr/super/docker-compose.yml,com.docker.compose.project.working_dir=/home/spr/super,com.docker.compose.service=wifid","LocalVolumes":"0","Mounts":"/home/spr/supe…,/home/spr/supe…,/home/spr/supe…","Name":"superwifid","Names":"superwifid","Networks":"host","Ports":"","Project":"super","Publishers":[],"RunningFor":"26 hours ago","Service":"wifid","Size":"0B","State":"running","Status":"Up 26 minutes"}\n'
      })

      this.get('/info/hostname', () => {
        return '"ubuntu"'
      })

      this.get('/info/uptime', () => {
        return {
          time: '12:16:37',
          uptime: '11 days, 5:52',
          users: 0,
          load_1m: 0.17,
          load_5m: 0.12,
          load_15m: 0.04,
          time_hour: 12,
          time_minute: 16,
          time_second: 37,
          uptime_days: 11,
          uptime_hours: 5,
          uptime_minutes: 52,
          uptime_total_seconds: 971520
        }
      })

      this.get('/info/docker', () => {
        return []
      })

      this.put('/backup', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let version = '"v0.1.0-beta.0'
        let backup = {
          Name: `spr-configs-${version}.tgz`,
          Timestamp: Date.now()
        }

        schema.backups.create(backup)

        return JSON.stringify(backup.Name)
      })

      this.get('/backup', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return schema.backups.all().models
      })

      this.del('/backup/:name', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let id = request.params.name
        return schema.backups.findBy({ Name: id }).destroy()
      })
      ////

      this.get('/iw/dev', (schema) => {
        return {
          phy1: {
            'wlan1.4103': {
              ifindex: '62',
              wdev: '0x9',
              addr: '44:a5:6e:63:c5:f2',
              type: 'AP/VLAN',
              channel: '36 (5180 MHz), width: 80 MHz, center1: 5210 MHz',
              txpower: '18.00 dBm'
            },
            wlan1: {
              ifindex: '4',
              wdev: '0x1',
              addr: '44:a5:6e:63:c5:f2',
              ssid: 'TestAP',
              type: 'AP',
              channel: '36 (5180 MHz), width: 80 MHz, center1: 5210 MHz',
              txpower: '18.00 dBm',
              multicast_txq: {
                qsz_byt: 0,
                qsz_pkt: 0,
                flows: 0,
                drops: 0,
                marks: 0,
                overlmt: 0,
                hashcol: 0,
                tx_bytes: 0,
                tx_packets: 0
              }
            }
          },
          phy0: {
            wlan0: {
              ifindex: '3',
              wdev: '0x100000001',
              addr: 'e4:5f:01:3c:4b:77',
              type: 'managed',
              channel: '36 (5180 MHz), width: 20 MHz, center1: 5180 MHz',
              txpower: '31.00 dBm'
            }
          },
          phy2: {
            wlan2: {
              ifindex: '5',
              wdev: '0x1',
              addr: '44:a5:6e:63:c5:f3',
              type: 'managed',
              channel: '36 (5180 MHz), width: 80 MHz, center1: 5210 MHz',
              txpower: '18.00 dBm'
            }
          }
        }
      })

      this.get('/iw/dev/:iface/scan', (schema, request) => {
        let iface = request.params.iface

        return [
          {
            bssid: '33:33:33:33:33:33',
            interface: iface,
            freq: 2412,
            capability: 'ESS Privacy ShortSlotTime RadioMeasure (0x1411)',
            ssid: 'ssid_AABBCC',
            supported_rates: [1, 2, 5.5, 11, 18, 24, 36, 54],
            erp: '<no flags>',
            'erp_d4.0': '<no flags>',
            rsn: 'Version: 1',
            group_cipher: 'CCMP',
            pairwise_ciphers: 'CCMP',
            authentication_suites: 'PSK',
            capabilities: '0x72 0x08 0x01 0x00 0x00',
            extended_supported_rates: [6, 9, 12, 48],
            station_count: 1,
            channel_utilisation: '87/255',
            available_admission_capacity: 0,
            ht_rx_mcs_rate_indexes_supported: '0-23',
            primary_channel: 1,
            secondary_channel_offset: 'no secondary',
            rifs: 1,
            ht_protection: 'no',
            non_gf_present: 1,
            obss_non_gf_present: 0,
            dual_beacon: 0,
            dual_cts_protection: 0,
            stbc_beacon: 0,
            l_sig_txop_prot: 0,
            pco_active: 0,
            pco_phase: 0,
            wps: 'Version: 1.0',
            wi_fi_protected_setup_state: '2 (Configured)',
            response_type: '3 (AP)',
            uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            manufacturer: 'ABC',
            model: 'ABCDEF',
            model_number: 123456,
            serial_number: 1,
            primary_device_type: '1-00112233-2',
            device_name: 'ABCdev',
            config_methods: 'Display',
            rf_bands: '0x3',
            version2: 2,
            wmm: 'Parameter version 1',
            be: 'CW 15-1023, AIFSN 3',
            bk: 'CW 15-1023, AIFSN 7',
            vi: 'CW 7-15, AIFSN 2, TXOP 3008 usec',
            vo: 'CW 3-7, AIFSN 2, TXOP 1504 usec',
            nonoperating_channel_max_measurement_duration: 0,
            measurement_pilot_capability: 0,
            tsf_usec: 31442397148,
            sta_channel_width_mhz: 20,
            beacon_interval_tus: 100,
            signal_dbm: -67,
            last_seen_ms: 0,
            selected_rates: [1, 2, 5.5, 11],
            ds_parameter_set_channel: 1,
            max_amsdu_length_bytes: 7935,
            minimum_rx_ampdu_time_spacing_usec: 4
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

      this.get('/notifications', (schema) => {
        return [
          {
            Conditions: {
              Prefix: 'nft:drop:forward',
              Protocol: 'tcp',
              DstIP: '',
              DstPort: 0,
              SrcIP: '',
              SrcPort: 0
            },
            Notification: true
          },
          {
            Conditions: {
              Prefix: 'nft:drop:input',
              Protocol: 'tcp',
              DstIP: '',
              DstPort: 0,
              SrcIP: '',
              SrcPort: 0
            },
            Notification: true
          },
          {
            Conditions: {
              Prefix: 'nft:drop:pfw',
              Protocol: 'tcp',
              DstIP: '',
              DstPort: 0,
              SrcIP: '',
              SrcPort: 0
            },
            Notification: true
          },
          {
            Conditions: {
              Prefix: 'nft:drop:input',
              Protocol: 'udp',
              DstIP: '',
              DstPort: 0,
              SrcIP: '',
              SrcPort: 0
            },
            Notification: true
          },
          {
            Conditions: {
              Prefix: 'nft:drop:forward',
              Protocol: 'udp',
              DstIP: '',
              DstPort: 0,
              SrcIP: '',
              SrcPort: 0
            },
            Notification: true
          }
        ]
      })

      this.get('/hostapd/wlan1/config', (schema) => {
        return {
          ap_isolate: 1,
          auth_algs: 1,
          channel: 36,
          country_code: 'US',
          ctrl_interface: '/state/wifi/control_wlan1',
          ht_capab:
            '[LDPC][HT40+][HT40-][GF][SHORT-GI-20][SHORT-GI-40][TX-STBC][RX-STBC1]',
          hw_mode: 'a',
          ieee80211ac: 1,
          ieee80211d: 1,
          ieee80211n: 1,
          ieee80211w: 1,
          interface: 'wlan1',
          multicast_to_unicast: 1,
          per_sta_vif: 1,
          preamble: 1,
          rsn_pairwise: 'CCMP',
          sae_pwe: 2,
          sae_psk_file: '/configs/wifi/sae_passwords',
          ssid: 'TestLab',
          vht_capab:
            '[RXLDPC][SHORT-GI-80][TX-STBC-2BY1][RX-STBC-1][MAX-A-MPDU-LEN-EXP3][RX-ANTENNA-PATTERN][TX-ANTENNA-PATTERN]',
          vht_oper_centr_freq_seg0_idx: 42,
          vht_oper_chwidth: 1,
          wmm_enabled: 1,
          wpa: 2,
          wpa_disable_eapol_key_retries: 1,
          wpa_key_mgmt: 'WPA-PSK WPA-PSK-SHA256 SAE',
          wpa_psk_file: '/configs/wifi/wpa2pskfile'
        }
      })

      this.get('/hostapd/wlan0/config', (schema) => {
        //not defined so fail
        return new Response(404, {}, { error: 'config not found' })
      })

      this.get('/hostapd/wlan2/config', (schema) => {
        //not defined so fail
        return new Response(404, {}, { error: 'config not found' })
      })

      this.get('/hostapd/wlan1/status', (schema) => {
        return {
          'ssid[0]': 'TestAP',
          channel: 36,
          freq: 5180
        }
      })

      this.get('/hostapd/wlan1/all_stations', (schema) => {
        return {
          '11:11:11:11:11:11': {
            AKMSuiteSelector: '00-0f-ac-2',
            aid: '3',
            capability: '0x11',
            connected_time: '4946',
            dot11RSNAStatsSTAAddress: '11:11:11:11:11:11',
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
          '22:22:22:22:22:22': {
            AKMSuiteSelector: '00-0f-ac-2',
            aid: '3',
            capability: '0x11',
            connected_time: '4946',
            dot11RSNAStatsSTAAddress: '22:22:22:22:22:22',
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

      this.put('/ip/link/:name/up', (schema) => {
        return true
      })

      this.put('/hostapd/:dev/setChannel', (schema) => {
        return {
          Vht_oper_centr_freq_seg0_idx: 42,
          He_oper_centr_freq_seg0_idx: 42,
          Vht_oper_chwidth: 1,
          He_oper_chwidth: 1
        }
      })

      this.get('/hostapd/:dev/failsafe', (schema) => {
        return 'ok'
      })

      // plugins
      this.get('/plugins', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return schema.plugins.all().models
      })

      this.put('/plugins/:name', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        let plugin = schema.plugins.findBy({ Name: attrs.Name })
        if (plugin) {
          plugin.update(attrs)
        } else {
          schema.plugins.create(attrs)
        }

        return schema.plugins.all().models
      })

      this.delete('/plugins/:name', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let Name = request.params.name
        schema.plugins.findBy({ Name }).destroy()
        return schema.plugins.all().models
      })

      this.get('/plusToken', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }
        return JSON.stringify('token')
      })

      //DNS plugin
      this.get('/plugins/dns/block/config', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return {
          BlockLists: schema.dnsblocklists.all().models,
          BlockDomains: schema.dnsoverrides.where({ Type: 'block' }).models,
          PermitDomains: schema.dnsoverrides.where({ Type: 'permit' }).models,
          ClientIPExclusions: null
        }
      })

      this.get('/plugins/dns/block/metrics', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return {
          TotalQueries: 65534,
          BlockedQueries: 4096,
          BlockedDomains: 1024
        }
      })

      this.put('/plugins/dns/block/setRefresh', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return new Response(200, {})
      })

      this.get('/plugins/dns/block/blocklists', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return schema.dnsblocklists.all().models
      })

      this.put('/plugins/dns/block/blocklists', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        return schema.dnsblocklists.create(attrs)
      })

      this.delete('/plugins/dns/block/blocklists', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        let URI = attrs.URI
        return schema.dnsblocklists.findBy({ URI }).destroy()
      })

      this.put('/plugins/dns/block/override', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        return schema.dnsoverrides.create(attrs)
      })

      this.delete('/plugins/dns/block/override', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        let Domain = attrs.Domain
        return schema.dnsoverrides.findBy({ Domain }).destroy()
      })

      this.get('/plugins/dns/block/dump_domains', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return [
          '_thums.ero-advertising.com.',
          '0.fls.doubleclick.net.',
          '0.r.msn.com.',
          '0.start.bz.',
          '0.up.qingdaonews.com.'
        ]
      })

      this.get('/plugins/dns/log/config', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return {
          HostPrivacyIPList: schema.dnslogprivacylists.all().models,
          DomainIgnoreList: schema.dnslogdomainignorelists.all().models
        }
      })

      this.get('/plugins/dns/log/host_privacy_list', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return schema.dnslogprivacylists.all().models.map((d) => d.ip)
      })

      this.get('/plugins/dns/log/domain_ignores', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return schema.dnslogdomainignorelists.all().models.map((d) => d.domain)
      })

      this.get('/plugins/dns/log/history/:ip', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

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

      this.get('/plugins/wireguard/peers', (schema, request) => {
        return schema.wireguardpeers.all().models
      })

      this.put('/plugins/wireguard/peer', (schema, request) => {
        // note prefer if the user generate the privkey & supply pubkey
        let attrs = JSON.parse(request.requestBody)

        const rKey = () => {
          let key = ''
          for (let i = 0; i < 32; i++) {
            key += String.fromCharCode(r(255))
          }

          return Base64.btoa(key)
        }

        let PublicKey = attrs.PublicKey || rKey()
        let PrivateKey = attrs.PublicKey ? '<PRIVATE KEY>' : rKey()

        let AllowedIPs = '192.168.3.4/32'
        if (attrs.AllowedIPs) {
          AllowedIPs = attrs.AllowedIPs
        } else {
          // get next free ip
          let ips = schema.wireguardpeers
            .all()
            .models.map((p) => p.AllowedIPs.replace(/\/.*/, ''))

          for (let i = 4; i < 100; i++) {
            let ip = `192.168.3.${i}`
            if (!ips.includes(ip)) {
              AllowedIPs = `${ip}/32`
              break
            }
          }
        }

        let Address = AllowedIPs.replace(/\/32$/, '/24')

        let peer = {
          PublicKey,
          AllowedIPs,
          Endpoint: '192.168.2.1:51280',
          PersistentKeepalive: 25
        }

        schema.wireguardpeers.create(peer)

        //output

        return {
          Interface: {
            PrivateKey,
            Address,
            DNS: '1.1.1.1, 1.0.0.1'
          },
          Peer: {
            PublicKey: '5vazmq54exf62jfXWE9YQ/m8kjcCZPtQBpLib2W+1H4=',
            AllowedIPs: '0.0.0.0/0',
            Endpoint: '192.168.2.1:51280',
            PersistentKeepalive: 25
          }
        }
      })

      this.delete('/plugins/wireguard/peer', (schema, request) => {
        //let id = request.params.id
        let attrs = JSON.parse(request.requestBody)
        let PublicKey = attrs.PublicKey

        return schema.wireguardpeers.findBy({ PublicKey }).destroy()
      })

      this.get('/plugins/wireguard/status', (schema, request) => {
        let status = {
          wg0: {
            publicKey: '5vazmq54exf62jfXWE9YQ/m8kjcCZPtQBpLib2W+1H4=',
            listenPort: 51280,
            peers: {}
          }
        }

        for (let p of schema.wireguardpeers.all().models) {
          status.wg0.peers[p.PublicKey] = {
            presharedKey: p.PresharedKey,
            allowedIps: [p.AllowedIPs]
          }
        }

        return status
      })

      this.get('/plugins/wireguard/genkey', (schema, request) => {
        const rKey = () => {
          let key = ''
          for (let i = 0; i < 32; i++) {
            key += String.fromCharCode(r(255))
          }

          return Base64.btoa(key)
        }

        return {
          PrivateKey: rKey(),
          PublicKey: rKey()
        }
      })

      this.put('/plugins/wireguard/up', (schema, request) => {
        return true
      })

      this.put('/plugins/wireguard/down', (schema, request) => {
        return true
      })

      this.get('/plugins/wireguard/endpoints', (schema, request) => {
        return []
      })

      // nftables
      this.get('/nftables', (schema, request) => {
        return {
          nftables: [
            {
              metainfo: {
                version: '0.9.8',
                release_name: 'E.D.S.',
                json_schema_version: 1
              }
            },
            { table: { family: 'inet', name: 'filter', handle: 18 } },
            { table: { family: 'inet', name: 'nat', handle: 19 } },
            { table: { family: 'inet', name: 'mangle', handle: 20 } },
            { table: { family: 'ip', name: 'accounting', handle: 22 } }
          ]
        }
      })

      // firewall
      this.get('/firewall/config', (schema, request) => {
        return {
          ForwardingRules: schema.forwardrules.all().models,
          BlockRules: schema.blockrules.all().models,
          ForwardingBlockRules: schema.forwardblockrules.all().models,
          ServicePorts: schema.serviceports.all().models
        }
      })

      this.put('/firewall/forward', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        return schema.forwardrules.create(attrs)
      })

      this.delete('/firewall/forward', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        return schema.forwardrules.where(attrs).destroy()
      })

      this.put('/firewall/block', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        return schema.blockrules.create(attrs)
      })

      this.delete('/firewall/block', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        return schema.blockrules.where(attrs).destroy()
      })

      this.put('/firewall/block_forward', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        return schema.forwardblockrules.create(attrs)
      })

      this.delete('/firewall/block_forward', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        return schema.forwardblockrules.where(attrs).destroy()
      })

      this.put('/firewall/service_port', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        return schema.serviceports.create(attrs)
      })

      this.delete('/firewall/service_port', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        return schema.serviceports.where(attrs).destroy()
      })

      // tokens
      this.get('/tokens', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return schema.tokens.all().models
      })

      this.put('/tokens', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        attrs.Token = 'TOKEN' + parseInt(Math.random() * 4096)
        schema.tokens.create(attrs)
        return attrs
      })

      this.delete('/tokens', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        return schema.tokens.where(attrs).destroy()
      })

      //Dyndns plugin
      this.get('/plugins/dyndns/config', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        return {
          provider: 'Cloudflare',
          email: '',
          password: '',
          login_token: 'Tokenish',
          domains: [
            {
              domain_name: 'supernetworks.org',
              sub_domains: ['dyndns']
            }
          ],
          ip_url: 'https://ip4.seeip.org',
          ipv6_url: '',
          ip_type: 'IPv4',
          interval: 300,
          socks5: '',
          resolver: '8.8.8.8',
          run_once: true
        }
      })

      //pfw
      this.get('/plugins/pfw/config', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let BlockRules = schema.pfwBlockRules.all().models
        let TagRules = schema.pfwTagRules.all().models
        let ForwardingRules = schema.pfwForwardRules.all().models
        let SiteVPNs = schema.vpnSites.all().models

        return {
          ForwardingRules,
          BlockRules,
          TagRules,
          GroupRules: [],
          Variables: {},
          SiteVPNs,
          APIToken: '*masked*'
        }
      })

      this.put('/plugins/pfw/sitevpns', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        schema.vpnSites.create(attrs)

        return attrs
      })

      this.put('/plugins/pfw/block', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        schema.pfwBlockRules.create(attrs)

        return attrs
      })

      this.put('/plugins/pfw/forward', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        schema.pfwForwardRules.create(attrs)

        return attrs
      })

      //update pfw rules
      this.put('/plugins/pfw/:type/:index', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let type = request.params.type
        let index = parseInt(request.params.index) + 1
        let attrs = JSON.parse(request.requestBody)
        if (type == 'block') {
          schema.pfwBlockRules.find(index).update(attrs)
        } else if (type == 'forward') {
          schema.pfwForwardRules.find(index).update(attrs)
        } else if (type == 'tag') {
          schema.pfwTagRules.find(index).update(attrs)
        }

        return attrs
      })

      this.delete('/plugins/pfw/:type/:index', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let type = request.params.type
        let index = parseInt(request.params.index) + 1
        if (type == 'block') {
          return schema.pfwBlockRules.find(index).destroy()
        } else if (type == 'forward') {
          return schema.pfwForwardRules.find(index).destroy()
        } else if (type == 'tag') {
          return schema.pfwTagRules.find(index).destroy()
        } else if (type == 'sitevpns') {
          return schema.vpnSites.find(index).destroy()
        }
      })

      this.get('/plugins/mesh/config', (schema, request) => {
        return {
          ParentIP: '',
          ParentAPIToken: '',
          LeafRouters: []
        }
      })

      this.get('/plugins/mesh/leafMode', (schema, request) => {
        return false
      })

      this.get('/plugins/mesh/leafRouters', (schema, request) => {
        return []
        /*
        let token = schema.tokens.findBy({Name: 'PLUS-MESH-API-DOWNHAUL-TOKEN'})
        let dev = schema.devices.findBy({Name: 'device-3'})

        return [
          {APIToken: token.Token, IP: dev.RecentIP},
        ]
        */
      })

      this.put('/plugins/mesh/setSSID', (schema, request) => {
        return true
      })

      this.get('/release', (schema, request) => {
        return {
          CustomChannel: '-dev',
          CustomVersion: '0.1.29',
          Current: 'latest-dev'
        }
      })

      this.get('/releaseChannels', (schema, request) => {
        return ['', '-dev']
      })

      this.get(
        '/releasesAvailable?container=super_superd',
        (schema, request) => {
          return [
            'latest',
            '0.1.7',
            '0.1.25dev',
            '0.1.25',
            'latest-dev',
            '0.1.25-dev',
            '0.1.26',
            '0.1.26-dev',
            '0.1.27',
            '0.1.27-dev',
            '0.1.28',
            '0.1.28-dev',
            '0.1.29',
            '0.1.29-dev',
            '0.1.30',
            '0.1.31',
            '0.1.32',
            '0.1.32-dev'
          ]
        }
      )

      this.get('/plugins/db/config', (schema, request) => {
        return {
          SaveEvents: [
            'www:auth:user:success',
            'log:www:access',
            'dns:serve:event',
            'log:api'
          ],
          MaxSize: 10485760
        }
      })

      this.get('/plugins/db/buckets', (schema, request) => {
        return [
          'dns:block:event',
          'dns:serve:192.168.2.101',
          'dns:serve:event',
          'log:api',
          'log:test',
          'log:www:access',
          'nft:lan:in',
          'nft:wan:in',
          'www:auth:user:success',
          'alert:auth:failure:',
          'alert:nft:drop:input:',
          'alert:wifi:auth:fail:',
          'nft:drop:input',
          'wifi:auth:fail',
          'wifi:auth:success'
        ]
      })

      this.get('/plugins/db/stats', (schema, request) => {
        return {
          Size: 13344768,
          Topics: [
            'nft:wan:in',
            'dns:serve:192.168.2.102',
            'nft:wan:out',
            'log:www:access',
            'www:auth:token:success',
            'nft:lan:in'
          ]
        }
      })

      this.get('/plugins/db/stats/:bucket', (schema, request) => {
        return {
          BranchPageN: 1,
          BranchOverflowN: 0,
          LeafPageN: 55,
          LeafOverflowN: 0,
          KeyN: 383,
          Depth: 2,
          BranchAlloc: 4096,
          BranchInuse: 1336,
          LeafAlloc: 225280,
          LeafInuse: 205673,
          BucketN: 1,
          InlineBucketN: 0,
          InlineBucketInuse: 0
        }
      })

      this.get('/plugins/db/items/:bucket', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let bucket = request.params.bucket
        let filter = request.queryParams.filter

        // Decode the URL-encoded filter parameter
        if (filter) {
          filter = decodeURIComponent(filter)
        }

        if (bucket.startsWith('dns:serve:')) {
          let types = ['NOERROR', 'NODATA', 'OTHERERROR', 'BLOCKED']
          let ip = bucket.replace(/^dns:serve:/, '')
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
        } else if (bucket.startsWith('alert:auth:failure:')) {
          try {
            if (filter) return jsonpath.query(authFail, filter)
          } catch (e) {
            alert(e)
          }
          return authFail
        } else if (bucket.startsWith('alert:nft:drop:input')) {
          try {
            if (filter) return jsonpath.query(nftDrop, filter)
          } catch (e) {
            alert(e)
          }
          return nftDrop
        } else if (bucket.startsWith('alert:wifi:auth:fail')) {
          try {
            if (filter) return jsonpath.query(wifiAuthFail, filter)
          } catch (e) {
            alert(e)
          }
          return wifiAuthFail
        }

        //log:api
        let res = []
        for (let i = 0; i < 10; i++) {
          let day = `${i + 1}`.padStart(2, '0')
          let log = {
            file: '/code/firewall.go:1264',
            func: 'main.establishDevice',
            level: 'info',
            msg: 'Populating route and vmaps aa:c0:6c:34:aa:20 192.168.2.10 ` eth0 ` wlan1.4303',
            Timestamp: `2022-03-${day}T08:05:29.976935196Z`
          }

          res.push(log)
        }

        return res
      })

      this.get('/uplink/wifi', (schema, request) => {
        return {
          WPAs: [
            {
              Disabled: true,
              Password: 'password',
              SSID: 'SPRLabs',
              KeyMgmt: 'WPA-PSK WPA-PSK-SHA256',
              Priority: '1',
              BSSID: '00:11:22:33:44:55:66'
            }
          ]
        }
      })

      this.put('/uplink/wifi', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let attrs = JSON.parse(request.requestBody)
        schema.uplinks.create(attrs)

        return attrs
      })

      this.get('/subnetConfig', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        let TinyNets = schema.tinynets.all().models.map((s) => s.Subnet)

        return { TinyNets, LeaseTime: '24h0m0s' }
      })

      this.put('/subnetConfig', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }

        // array of strings subnets
        let attrs = JSON.parse(request.requestBody)
        schema.tinynets.all().destroy()
        attrs.TinyNets.map((Subnet) => {
          schema.tinynets.create({ Subnet })
        })
      })

      this.get('/multicastSettings', (schema, request) => {
        return {
          Disabled: false,
          Addresses: [
            {
              Address: '239.255.255.250:1900',
              Disabled: false,
              Tags: []
            },
            {
              Address: '224.0.0.251:5353',
              Disabled: false,
              Tags: null
            }
          ],
          DisableMDNSAdvertise: false,
          MDNSName: ''
        }
      })

      this.get('/dnsSettings', (schema, request) => {
        return { UpstreamTLSHost: '', UpstreamIPAddress: '', TlsDisable: false }
      })

      this.get('/logs', (schema, request) => {
        let logs = []
        let log = {
          _HOSTNAME: 'spr',
          CONTAINER_NAME: 'superwireguard',
          PRIORITY: '6',
          CONTAINER_ID_FULL:
            'f2a279845383b08b22aaea297d4e027971f6ab76d1c9c192eb1020b20dfa3cf3',
          CONTAINER_ID: 'f2a279845383',
          _EXE: '/usr/bin/dockerd',
          SYSLOG_IDENTIFIER: 'f2a279845383',
          _MACHINE_ID: 'c2726e42e7de4a85bc9d837c034242a4',
          IMAGE_NAME: 'ghcr.io/spr-networks/super_wireguard:latest-dev',
          CONTAINER_TAG: 'f2a279845383',
          __REALTIME_TIMESTAMP: '1698316313985702',
          MESSAGE: '@ GET /status'
        }

        for (let i = 0; i < 10; i++) {
          let __REALTIME_TIMESTAMP =
            parseInt(log.__REALTIME_TIMESTAMP) + i * 1e6
          let CONTAINER_NAME = rpick([
            'superapi',
            'superwifid',
            'superwireguard'
          ])
          logs.push({ ...log, CONTAINER_NAME, __REALTIME_TIMESTAMP })
        }
        return logs
      })

      this.get('/alerts', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }
        let alerts = [
          {
            TopicPrefix: 'nft:drop:mac',
            MatchAnyOne: false,
            InvertRule: false,
            Conditions: [],
            Actions: [
              {
                SendNotification: false,
                StoreAlert: true,
                MessageTitle: 'MAC Filter Violation',
                MessageBody:
                  'MAC IP Violation {{IP.SrcIP#Device}} {{IP.SrcIP}} {{Ethernet.SrcMAC}} to {{IP.DstIP}} {{Ethernet.DstMAC}}',
                NotificationType: 'warning',
                GrabEvent: true,
                GrabValues: false
              }
            ],
            Name: 'MAC Filter Violation',
            Disabled: true,
            RuleId: '7f3266dd-7697-44ce-8ddd-36a006043509'
          },
          {
            TopicPrefix: 'auth:failure',
            MatchAnyOne: false,
            InvertRule: false,
            Conditions: [
              {
                JPath: '$[?(@.type=="user")]'
              }
            ],
            Actions: [
              {
                SendNotification: false,
                StoreAlert: true,
                MessageTitle: 'Login Failure',
                MessageBody: '{{name}} failed to login with {{reason}}',
                NotificationType: 'error',
                GrabEvent: true,
                GrabValues: false
              }
            ],
            Name: 'User Login Failure',
            Disabled: true,
            RuleId: 'ea676ee7-ec68-4a23-aba4-ba69feee4d8c'
          },
          {
            TopicPrefix: 'nft:drop:private',
            MatchAnyOne: false,
            InvertRule: false,
            Conditions: [],
            Actions: [
              {
                SendNotification: false,
                StoreAlert: true,
                MessageTitle: 'Drop Private Network Request',
                MessageBody:
                  'Dropped Traffic from {{IP.SrcIP#Device}} {{IP.SrcIP}} {{InDev#Interface}} to {{IP.DstIP}} {{OutDev#Interface}}',
                NotificationType: 'warning',
                GrabEvent: true,
                GrabValues: false
              }
            ],
            Name: 'Drop Private Request',
            Disabled: true,
            RuleId: '2adbec19-6b47-4a99-a499-ab0b8da652a8'
          },
          {
            TopicPrefix: 'wifi:auth:fail',
            MatchAnyOne: false,
            InvertRule: false,
            Conditions: [],
            Actions: [
              {
                SendNotification: true,
                StoreAlert: true,
                MessageTitle: 'WiFi Auth Failure',
                MessageBody:
                  '{{MAC#Device}} {{MAC}} failed wifi authentication {{Reason}} with type {{Type}}',
                NotificationType: 'warning',
                GrabEvent: true,
                GrabValues: false
              }
            ],
            Name: 'Wifi Auth Failure',
            Disabled: false,
            RuleId: 'f16e9a58-9f80-455c-a280-211bd8b1fd05'
          },
          {
            TopicPrefix: 'wifi:auth:success',
            MatchAnyOne: false,
            InvertRule: false,
            Conditions: [],
            Actions: [
              {
                SendNotification: true,
                StoreAlert: false,
                MessageTitle: 'Device Connected',
                MessageBody: 'Authentication success for {{MAC#Device}}',
                NotificationType: 'success',
                GrabEvent: true,
                GrabValues: false,
                GrabFields: ['MAC']
              }
            ],
            Name: 'Device Connected',
            Disabled: false,
            RuleId: '387c3a9d-b072-4ba7-b6ff-895f484db4ec'
          },
          {
            TopicPrefix: 'nft:drop:input',
            MatchAnyOne: false,
            InvertRule: false,
            Conditions: [],
            Actions: [
              {
                SendNotification: false,
                StoreAlert: true,
                MessageTitle: 'Dropped Input',
                MessageBody:
                  'Drop Incoming Traffic to Router from {{IP.SrcIP}} to port {{TCP.DstPort}} {{UDP.DstPort}}',
                NotificationType: 'warning',
                GrabEvent: true,
                GrabValues: false
              }
            ],
            Name: 'Dropped Input',
            Disabled: true,
            RuleId: '481822f4-a20c-4cec-92d9-dad032d2c450'
          },
          {
            TopicPrefix: 'dns:serve:',
            MatchAnyOne: false,
            InvertRule: false,
            Conditions: [
              {
                JPath: '$[?(@.FirstName=="c2h.se.")]'
              }
            ],
            Actions: [
              {
                SendNotification: false,
                StoreAlert: false,
                MessageTitle: 'Domain resolve',
                MessageBody: '{{Remote#Device}} domain lookup: {{FirstName}}',
                NotificationType: 'info',
                GrabEvent: true,
                GrabValues: false,
                GrabFields: ['FirstName', 'Remote']
              }
            ],
            Name: 'dns resolve',
            Disabled: true,
            RuleId: 'f6bdb6ee-ffcb-41af-b3c7-6270cba936fb'
          },
          {
            TopicPrefix: 'device:vpn:online',
            MatchAnyOne: false,
            InvertRule: false,
            Conditions: [],
            Actions: [
              {
                SendNotification: true,
                StoreAlert: false,
                MessageTitle:
                  '{{DeviceIP#Device}} connected via {{VPNType}} from {{RemoteEndpoint}}',
                MessageBody:
                  '{{DeviceIP#Device}} connected via {{VPNType}} from {{RemoteEndpoint}}',
                NotificationType: 'info',
                GrabEvent: true,
                GrabValues: false
              }
            ],
            Name: 'VPN Connection',
            Disabled: false,
            RuleId: '5e87c42b-d3da-45fa-a58f-ae689134c2a7'
          },
          {
            TopicPrefix: 'device:vpn:offline',
            MatchAnyOne: false,
            InvertRule: false,
            Conditions: [],
            Actions: [
              {
                SendNotification: true,
                StoreAlert: false,
                MessageTitle:
                  '{{DeviceIP#Device}} disconnected from {{VPNType}} by {{RemoteEndpoint}}',
                MessageBody:
                  '{{DeviceIP#Device}} disconnected from {{VPNType}} by {{RemoteEndpoint}}',
                NotificationType: 'info',
                GrabEvent: true,
                GrabValues: false
              }
            ],
            Name: 'VPN Connection',
            Disabled: false,
            RuleId: '95b8992a-53ff-46ad-a6d8-9882fc13241f'
          }
        ]
        return alerts
      })

      this.get('/otp_status', (schema, request) => {
        if (!authOK(request)) {
          return new Response(401, {}, { error: 'invalid auth' })
        }
        return []
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
