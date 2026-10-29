import { searchJump } from 'components/Navbars/RouteJump'

jest.mock('react-hotkeys', () => ({
  GlobalHotKeys: () => null,
  HotKeys: ({ children }) => children
}))

const items = [
  { name: 'Devices', path: 'devices' },
  { name: 'Firewall', path: 'firewall' },
  { name: 'DNS Log', path: 'dnsLog/:ips' }
]

const devices = [
  { Name: 'rpi4', MAC: '11:11:11:11:11:11', RecentIP: '192.168.2.101' },
  { Name: 'laptop', MAC: 'AA:BB:CC:DD:EE:01', RecentIP: '192.168.2.102' },
  { Name: 'cafe-tv', MAC: '02:00:00:00:00:03', RecentIP: '192.168.2.103' },
  { Name: '', MAC: 'de:ad:be:ef:00:04', RecentIP: '192.168.2.104' },
  { Name: 'wg-peer', WGPubKey: 'pubkey' }
]

const interfaces = [
  {
    RuleName: 'Plugin-spr-dyndns',
    Interface: 'spr-dyndns',
    SrcIP: '172.18.0.2',
    Policies: ['wan', 'dns']
  },
  {
    RuleName: 'Plugin-spr-tailscale',
    Interface: 'spr-tailscale',
    SrcIP: '192.168.2.110',
    Policies: ['wan', 'dns', 'api']
  }
]

const search = (query) => searchJump({ items, devices, interfaces }, query)
const names = (list, key) => list.map((entry) => entry[key])

describe('search bar matching', () => {
  it('shows everything for an empty search', () => {
    const found = search('')
    expect(found.items).toHaveLength(items.length)
    expect(found.devices).toHaveLength(devices.length)
    expect(found.interfaces).toHaveLength(interfaces.length)
  })

  it('finds sections and devices by name', () => {
    expect(names(search('fire').items, 'name')).toEqual(['Firewall'])
    expect(names(search('LAP').devices, 'Name')).toEqual(['laptop'])
  })

  it('finds devices by IP, including devices without an IP', () => {
    expect(names(search('192.168.2.10').devices, 'Name')).toEqual([
      'rpi4',
      'laptop',
      'cafe-tv',
      ''
    ])
    expect(names(search('192.168.2.102').devices, 'Name')).toEqual(['laptop'])
  })

  it('finds devices by MAC address', () => {
    expect(names(search('aa:bb').devices, 'Name')).toEqual(['laptop'])
    expect(names(search('AA:BB:CC').devices, 'Name')).toEqual(['laptop'])
    expect(names(search('aa-bb-cc').devices, 'Name')).toEqual(['laptop'])
    expect(names(search('ee:01').devices, 'Name')).toEqual(['laptop'])
    expect(names(search('aabbcc').devices, 'Name')).toEqual(['laptop'])
    expect(names(search('de:ad:be:ef:00:04').devices, 'MAC')).toEqual([
      'de:ad:be:ef:00:04'
    ])
    expect(search('aa:bb').isMAC).toBe(true)
  })

  it('does not match MACs on short or non hex text', () => {
    expect(names(search('ca').devices, 'Name')).toEqual(['cafe-tv'])
    expect(names(search('cafe').devices, 'Name')).toEqual(['cafe-tv'])
    expect(search('ca').isMAC).toBe(false)
    expect(search('rpi').isMAC).toBe(false)
  })

  it('finds container interfaces by interface name, rule name and IP', () => {
    expect(names(search('spr-dyndns').interfaces, 'Interface')).toEqual([
      'spr-dyndns'
    ])
    expect(names(search('TAILSCALE').interfaces, 'Interface')).toEqual([
      'spr-tailscale'
    ])
    expect(names(search('plugin-spr').interfaces, 'Interface')).toEqual([
      'spr-dyndns',
      'spr-tailscale'
    ])
    expect(names(search('172.18').interfaces, 'Interface')).toEqual([
      'spr-dyndns'
    ])
    expect(search('spr-dyndns').devices).toEqual([])
  })
})
