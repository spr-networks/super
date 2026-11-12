import API, { api, groupAPI, firewallAPI, topologyAPI, wifiAPI, wireguardAPI, pfwAPI, wanAPI, meshAPI, trafficAPI, trafficInsightsAPI, geoBlockAPI, nfmapAPI, dbAPI, pluginAPI } from 'api'
import { deviceAPI } from '../assistantDeviceApi'
import APIMesh from 'api/mesh'
import APIWifi from 'api/Wifi'
import { Address4, Address6 } from 'ip-address'
import { object, string, integer, boolean, enumValue } from '../operationSchema'

const OVERVIEW = 'Network > Overview', WIFI = 'Network > Wifi', VPN = 'Network > VPN'
const DHCP = 'Network > DHCP Settings', LINK = 'Network > Link Settings'
const WAN = 'Network > Internet Health', MESH = 'Network > MESH', TRAFFIC = 'Network > Traffic'
const empty = object({})
const ifaceField = { ...string(), pattern: '^[A-Za-z0-9_.:-]{1,64}$' }
const ipField = { ...string(), minLength: 2, maxLength: 64 }
const ssidField = { ...string(), minLength: 1, maxLength: 32 }
const ifaceInput = object({ iface: ifaceField }, ['iface'])
const windowInput = object({ minutes: { ...integer(), minimum: 1, maximum: 10080 } }, ['minutes'])
const source = (file, line) => `frontend/src/${file}:${line}`
const clone = (value) => JSON.parse(JSON.stringify(value))
const secretKey = /password|passphrase|private.?key|preshared|(^|_)psk($|_)|token|secret|credential|authorization|pskentry|guestpassword|tlskey|tlsca|parentca/i
export const redactNetwork = (value) => {
  if (Array.isArray(value)) return value.map(redactNetwork)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .map(([key, entry]) => [key, secretKey.test(key) ? '[redacted]' : redactNetwork(entry)]))
  return value
}
const read = (label, menus, schema, call, sources) => ({ domain: 'network', kind: 'read', label,
  description: label, menus, schema, sources, redact: redactNetwork,
  run: async (input) => redactNetwork(await call(input)) })
const write = (label, menus, schema, sources) => ({ domain: 'network', kind: 'write', label,
  description: `${label}. Prepare a review before application; configuration verification does not prove packet delivery.`,
  menus, schema, sources, redact: redactNetwork })
const ui = (label, menus, route, instructions, sources) => ({ domain: 'network', kind: 'ui', label,
  description: label, menus, schema: empty, route, instructions, sources })
const accepted = (summary) => ({ accepted: true, summary })
const verify = (verified, summary, data) => ({ verified, summary, data: redactNetwork(data) })
const ifaceName = (value) => {
  if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(value || '')) throw new Error('Invalid interface identity')
  return value
}
const validIP = (value, cidr = false) => {
  if (!cidr && String(value).includes('/')) throw new Error('Expected an IP address without prefix')
  if (cidr && !String(value).includes('/')) throw new Error('An explicit network prefix is required')
  try { return String(value).includes(':') ? new Address6(value) : new Address4(value) }
  catch (_) { throw new Error('Invalid IP address or prefix') }
}
const leaseDuration = (value) => {
  const match = /^(?:(\d{1,2})h)?(?:(\d{1,2})m)?(?:(\d{1,2})s)?$/.exec(value || '')
  if (!match || !match.slice(1).some((part) => part !== undefined)) throw new Error('Use a duration such as 6h or 6h0m0s')
  const hours = Number(match[1] || 0), minutes = Number(match[2] || 0), seconds = Number(match[3] || 0)
  if (minutes > 59 || seconds > 59 || hours * 3600 + minutes * 60 + seconds <= 0) throw new Error('Invalid lease duration')
  return `${hours}h${minutes}m${seconds}s`
}
const dhcpConfiguration = async () => {
  const config = await api.get('/subnetConfig')
  if (!Array.isArray(config?.TinyNets) || typeof config.LeaseTime !== 'string') throw new Error('DHCP configuration could not be read')
  return { TinyNets: config.TinyNets, LeaseTime: config.LeaseTime }
}
const allocationSnapshot = async (input) => {
  const address = validIP(input.cidr, true)
  if (input.cidr.includes(':') || address.subnetMask < 8 || address.subnetMask > 24) throw new Error('TinyNet must be an IPv4 /8 through /24 network')
  if (address.startAddress().correctForm() !== input.cidr.split('/')[0]) throw new Error('Use a canonical allocation network address')
  const config = await dhcpConfiguration()
  if (input.action === 'add') {
    if (config.TinyNets.includes(input.cidr)) throw new Error('Allocation range already exists')
    assertNoObservedOverlap(input.cidr, [...config.TinyNets, ...observedNetworks(await wifiAPI.interfacesConfiguration())])
    return { Config: config }
  }
  if (!config.TinyNets.includes(input.cidr)) throw new Error('Selected allocation range does not exist')
  if (config.TinyNets.length <= 1) throw new Error('Cannot remove the last allocation range')
  const inRange = (await deviceAPI.list()).filter((device) => {
    try { return Boolean(device.RecentIP) && new Address4(device.RecentIP).isInSubnet(address) } catch (error) { return false }
  })
  if (inRange.length) throw new Error('Allocation range still has device addresses; move those devices before removal')
  return { Config: config }
}
const selectOne = (items, predicate, label) => {
  const matches = (items || []).filter(predicate)
  if (matches.length !== 1) throw new Error(`Expected exactly one ${label}; found ${matches.length}`)
  return matches[0]
}
const selectedInterface = async ({ iface }) => selectOne(await wifiAPI.interfacesConfiguration(),
  (entry) => entry.Name === ifaceName(iface), 'interface')
const linkIPConfig = (entry) => ({ Name: entry.Name, Enabled: entry.Enabled ?? false,
  DisableDHCP: entry.DisableDHCP ?? false, DisableAPI: entry.DisableAPI ?? false,
  IP: entry.IP || '', Router: entry.Router || '', VLAN: entry.VLAN || '',
  AdditionalIPs: (entry.AdditionalIPs || []).map(address => ({ IP: address.IP || '', Router: address.Router || '' })) })
const sameLinkIPConfig = (actual, expected) => JSON.stringify(linkIPConfig(actual)) === JSON.stringify(linkIPConfig(expected))
const observedNetworks = (interfaces, ignoreIface) => (interfaces || [])
  .filter((entry) => entry.Name !== ignoreIface)
  .flatMap((entry) => [entry.IP, ...(entry.AdditionalIPs || []).map((a) => a.IP)])
  .filter((value) => typeof value === 'string' && value.includes('/'))
const assertNoObservedOverlap = (candidate, ranges) => {
  const parsed = validIP(candidate, true)
  for (const range of ranges) {
    if (candidate.includes(':') !== range.includes(':')) continue
    const existing = validIP(range, true)
    if (parsed.isInSubnet(existing) || existing.isInSubnet(parsed)) throw new Error(`Address range overlaps observed network ${range}`)
  }
}
const selectedDevice = async ({ identity }) => {
  const devices = await deviceAPI.list()
  return selectOne(Object.values(devices || {}), (entry) => entry.MAC === identity || entry.WGPubKey === identity, 'device identity')
}
const selectedLeaf = async ({ ip }) => {
  validIP(ip)
  return selectOne(await meshAPI.leafRouters(), (entry) => entry.IP === ip, 'enrolled mesh leaf')
}
const selectedProfile = async ({ iface, ssid, bssid }) => {
  const result = await api.get('/uplink/wifi')
  const entry = selectOne(result.WPAs, (entry) => entry.Iface === ifaceName(iface), 'uplink interface')
  selectOne(entry.Networks, (network) => network.SSID === ssid && (bssid === undefined || network.BSSID === bssid), 'saved WiFi profile')
  return entry
}
const profileMatches = (network, input) => network.SSID === input.ssid && (input.bssid === undefined || network.BSSID === input.bssid)
const profileInput = object({ iface: ifaceField, ssid: ssidField, bssid: string() }, ['iface', 'ssid'])
const peerList = (result) => Array.isArray(result) ? result : Object.values(result || {})
const peerSnapshot = async ({ publicKey }) => selectOne(peerList(await wireguardAPI.peers()), (p) => p.PublicKey === publicKey, 'peer public key')
const routeMatches = (route, input) => route.Client?.SrcIP === input.sourceIP &&
  route.OriginalDst?.IP === input.destination && route.DstInterface === input.iface &&
  (route.Protocol || '') === (input.protocol || '') && (route.OriginalDstPort || '') === (input.port || '')
const routeInput = object({ sourceIP: ipField, destination: ipField, iface: ifaceField,
  protocol: enumValue(['tcp', 'udp']), port: { ...string(), pattern: '^[0-9]{1,5}$' } }, ['sourceIP', 'destination', 'iface'])
const routeConfig = async (input) => {
  validIP(input.sourceIP); validIP(input.destination, true); ifaceName(input.iface)
  if (!!input.port !== !!input.protocol) throw new Error('A port and protocol must be supplied together')
  if (input.port && (Number(input.port) < 1 || Number(input.port) > 65535)) throw new Error('Invalid port')
  return pfwAPI.config()
}
const routeData = (input) => ({ RuleName: `Assistant route via ${input.iface}`,
  Client: { SrcIP: input.sourceIP }, OriginalDst: { IP: input.destination }, Dst: { IP: '' },
  DstInterface: input.iface, ...(input.port ? { Protocol: input.protocol, OriginalDstPort: input.port } : {}) })
const leafClient = (Class, leaf) => {
  validIP(leaf.IP)
  const client = new Class()
  const host = leaf.IP.includes(':') ? `[${leaf.IP}]` : leaf.IP
  client.setRemoteURL(`${window.location.protocol}//${host}/`)
  client.setAuthTokenHeaders(leaf.APIToken)
  return client
}
const leafHealth = async (leaf) => {
  const result = { IP: leaf.IP, routerAPI: 'unknown', meshAPI: 'unknown' }
  try { result.version = await leafClient(API, leaf).get('/version'); result.routerAPI = 'reachable' }
  catch (_) { result.routerAPI = 'unavailable'; return result }
  try { result.leafMode = await leafClient(APIMesh, leaf).leafMode(); result.meshAPI = 'reachable' }
  catch (_) { result.meshAPI = 'unavailable' }
  return result
}
const apNames = (devs) => Object.values(devs || {}).flatMap((phy) => Object.entries(phy || {})
  .filter(([name, info]) => typeof info?.type === 'string' && info.type.includes('AP') && info.ssid !== 'spr-setup' &&
    (name.includes('.ap') ? name.split('.').length <= 2 : !name.includes('.'))).map(([name]) => name)).sort()
const LEAF_TIMEOUT_MS = 4000
const within = (promise, ms) => { let timer
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms) })]).finally(() => clearTimeout(timer)) }
const leafStations = async (leaf) => {
  const row = { ip: leaf.IP, reachable: false, interfaces: [], failed: [] }
  let wifi, names
  try { wifi = leafClient(APIWifi, leaf); names = apNames(await within(wifi.iwDev(), LEAF_TIMEOUT_MS)); row.reachable = true } catch (_) { return row }
  await Promise.all(names.map(async (iface) => {
    try {
      const [stations, status] = await within(Promise.all([wifi.allStations(iface), wifi.status(iface)]), LEAF_TIMEOUT_MS)
      row.interfaces.push({ iface, ssid: status?.['ssid[0]'] ?? null, channel: status?.channel ?? null, freq: status?.freq ?? null, stations: stations || {} })
    } catch (_) { row.failed.push(iface) }
  }))
  row.interfaces.sort((a, b) => a.iface < b.iface ? -1 : 1); row.failed.sort()
  return row
}
const meshStations = async () => {
  let leaves
  try { leaves = await within(meshAPI.leafRouters(), LEAF_TIMEOUT_MS) } catch (_) { return { available: false, leaves: [] } }
  return { available: true, leaves: await Promise.all((Array.isArray(leaves) ? leaves : []).map(leafStations)) }
}
const ssidsFor = async (client) => {
  const interfaces = await client.interfacesConfiguration()
  return Promise.all(interfaces.filter((entry) => entry.Enabled && entry.Type === 'AP').map(async (entry) => ({
    iface: entry.Name, ssid: (await client.status(entry.Name))['ssid[0]']
  })))
}
const interfaceSources = [source('views/LinkConfiguration/UplinkConfiguration.js', 934), source('views/LinkConfiguration/LANLinkConfiguration.js', 527)]

export default [
  { id: 'network.topology.read', ...read('Read physical and policy topology', [OVERVIEW], empty,
    () => topologyAPI.getTopology(), [source('api/Topology.js', 8)]) },
  { id: 'network.devices.read', ...read('Read device identities and configured policies', [OVERVIEW, DHCP, TRAFFIC, VPN], empty,
    () => deviceAPI.list(), [source('api/Device.js', 8)]) },
  { id: 'network.groups.read', ...read('Read ordinary and service groups', [OVERVIEW], empty,
    () => groupAPI.list(), [source('api/Group.js', 8)]) },
  { id: 'network.firewall.read', ...read('Read firewall grants and blocks', [OVERVIEW], empty,
    () => firewallAPI.config(), [source('api/Firewall.js', 8)]) },
  { id: 'network.pfw.read', ...read('Read PFW routes and site VPN metadata', [OVERVIEW, VPN, DHCP], empty,
    () => pfwAPI.config(), [source('api/Pfw.js', 8)]) },
  { id: 'network.devices.group.add', ...write('Add one existing ordinary group while preserving memberships', [OVERVIEW],
    object({
      identity: { ...string(), description: 'Exact MAC or WGPubKey of the source device that will gain membership. Preserve its other groups and policies.' },
      targetIdentity: { ...string(), description: 'Exact MAC or WGPubKey of the destination device to connect to. It must already belong to the selected group; this is a device identity, not a group name.' },
      group: { ...string(), description: 'Exact Name of an enabled ordinary group already containing targetIdentity. Add it to identity without replacing existing memberships; do not use a policy name.' }
    }, ['identity', 'targetIdentity', 'group']), [source('api/Device.js', 56), source('api/Group.js', 8)]),
    snapshot: async (input) => {
      const device = await selectedDevice(input), groups = await groupAPI.list()
      const group = selectOne(groups, (g) => g.Name === input.group, 'group')
      if (group.Disabled || group.ServiceDestinations?.length) throw new Error('Select an enabled ordinary group')
      const devices = await deviceAPI.list()
      const target = selectOne(Object.values(devices || {}), (d) => d.MAC === input.targetIdentity || d.WGPubKey === input.targetIdentity, 'target device')
      if (!target.Groups?.includes(input.group)) throw new Error('Target is not a member of the selected group')
      if (Object.values(devices).some((d) => d.Groups?.includes(input.group) && ![input.identity, input.targetIdentity].includes(d.MAC || d.WGPubKey))) throw new Error('Group includes additional devices; narrow access needs a different group')
      return { device, group, devices }
    },
    project: (input, before) => ({ identity: input.identity, Groups: [...new Set([...(before.device.Groups || []), input.group])],
      group: before.group, affectedMembers: Object.values(before.devices).filter((d) => d.Groups?.includes(input.group)).map((d) => d.MAC || d.WGPubKey) }),
    run: async (input, context) => { await deviceAPI.updateGroups(input.identity, [...new Set([...(context.before.device.Groups || []), input.group])]); return accepted('Group membership saved') },
    verify: async (input, before) => { const data = await selectedDevice(input); return verify(data.Groups?.includes(input.group) === true && (before.device.Groups || []).every((g) => data.Groups.includes(g)), 'Re-read device group membership and preserved groups', data) } },
  { id: 'network.devices.endpoint_tag.add', ...write('Add an existing endpoint tag while preserving device tags', [OVERVIEW],
    object({ identity: string(), tag: string(), ip: ipField, protocol: enumValue(['tcp', 'udp']), port: string() }, ['identity', 'tag', 'ip', 'protocol', 'port']),
    [source('api/Device.js', 64), source('api/Firewall.js', 8)]),
    snapshot: async (input) => {
      const device = await selectedDevice(input), firewall = await firewallAPI.config()
      const endpoint = selectOne(firewall.Endpoints, (e) => e.IP === input.ip && e.Protocol === input.protocol && String(e.Port) === input.port && e.Tags?.includes(input.tag), 'matching endpoint')
      return { device, endpoint }
    },
    project: (input, before) => ({ identity: input.identity, endpoint: before.endpoint, DeviceTags: [...new Set([...(before.device.DeviceTags || []), input.tag])] }),
    run: async (input, context) => { await deviceAPI.updateTags(input.identity, [...new Set([...(context.before.device.DeviceTags || []), input.tag])]); return accepted('Endpoint tag saved') },
    verify: async (input, before) => { const data = await selectedDevice(input); return verify(data.DeviceTags?.includes(input.tag) === true && (before.device.DeviceTags || []).every((tag) => data.DeviceTags.includes(tag)), 'Re-read device tag membership and preserved tags', data) } },
  { id: 'network.pfw.route.add', ...write('Add one scoped route without duplicates', [OVERVIEW, VPN], routeInput, [source('components/Topology/useTopologyController.js', 290)]),
    snapshot: routeConfig,
    project: (input, before) => ({ action: before.ForwardingRules?.some((r) => routeMatches(r, input)) ? 'no-op' : 'add', rule: routeData(input) }),
    run: async (input, context) => { if (context.before.ForwardingRules?.some((r) => routeMatches(r, input))) return accepted('Identical route already exists; no change'); await pfwAPI.addForward(routeData(input)); return accepted('Scoped route saved') },
    verify: async (input) => { const data = await pfwAPI.config(); return verify(data.ForwardingRules?.some((r) => routeMatches(r, input)) === true, 'Re-read exact route tuple', data.ForwardingRules) } },
  { id: 'network.pfw.route.remove', ...write('Remove exactly one current route tuple', [OVERVIEW], routeInput, [source('api/Pfw.js', 19)]),
    snapshot: async (input) => { const config = await routeConfig(input); selectOne(config.ForwardingRules, (r) => routeMatches(r, input), 'route tuple'); return config },
    project: (input, before) => ({ action: 'remove', rule: before.ForwardingRules.find((r) => routeMatches(r, input)), remaining: before.ForwardingRules.filter((r) => !routeMatches(r, input)) }),
    run: async (input, context) => { const index = context.before.ForwardingRules.findIndex((r) => routeMatches(r, input)); if (index < 0) throw new Error('Route disappeared'); await pfwAPI.deleteForward(index); return accepted('Selected route removed') },
    verify: async (input) => { const config = await pfwAPI.config(); return verify(!config.ForwardingRules?.some((r) => routeMatches(r, input)), 'Re-read exact route tuple', config.ForwardingRules) } },
  { id: 'network.interfaces.read', ...read('Read interface roles, enablement and configured addresses', [LINK, WIFI, DHCP], empty,
    () => wifiAPI.interfacesConfiguration(), [source('api/Wifi.js', 640)]) },
  { id: 'network.addresses.read', ...read('Read current interface addresses', [LINK, DHCP, OVERVIEW], empty,
    () => wifiAPI.ipAddr(), [source('api/Wifi.js', 584)]) },
  { id: 'network.wifi.capabilities', ...read('Read WiFi hardware, interface modes and regulatory limits', [WIFI, LINK], empty,
    async () => ({ interfaces: await wifiAPI.iwDev(), capabilities: await wifiAPI.iwList(), regulatory: await wifiAPI.iwReg() }), [source('api/Wifi.js', 592)]) },
  { id: 'network.wifi.config', ...read('Read selected radio configuration', [WIFI], ifaceInput,
    (input) => wifiAPI.config(ifaceName(input.iface)), [source('api/Wifi.js', 537)]) },
  { id: 'network.wifi.status', ...read('Read selected radio operational status', [WIFI], ifaceInput,
    (input) => wifiAPI.status(ifaceName(input.iface)), [source('api/Wifi.js', 561)]) },
  { id: 'network.wifi.stations', ...read('Read selected AP client signal and rates', [WIFI], ifaceInput,
    (input) => wifiAPI.allStations(ifaceName(input.iface)), [source('api/Wifi.js', 553)]) },
  { id: 'network.wifi.channel.calculate', ...read('Calculate hostapd channel parameters; hardware and regulatory eligibility still require capability evidence', [WIFI],
    object({ Channel: { ...integer(), minimum: 1, maximum: 233 }, Mode: enumValue(['b', 'g', 'a']), Bandwidth: enumValue([20, 40, 80, 160, 8080]), HT_Enable: boolean(), VHT_Enable: boolean(), HE_Enable: boolean(), EHT_Enable: boolean() }, ['Channel', 'Mode', 'Bandwidth', 'HT_Enable', 'VHT_Enable', 'HE_Enable', 'EHT_Enable']),
    (input) => wifiAPI.calcChannel(input), [source('components/Wifi/WifiChannelParameters.js', 619), source('components/Wifi/WifiHostapd.js', 558)]) },
  { id: 'network.wifi.scan', ...write('Scan on a selected non-AP interface; may bring it up', [WIFI, LINK], ifaceInput, [source('components/Wifi/WifiScan.js', 43)]),
    snapshot: async (input) => { const devices = await wifiAPI.iwDev(); const rows = Object.values(devices || {}).flatMap((p) => Object.entries(p || {}).map(([name, info]) => ({ name, ...info }))); const iface = selectOne(rows, (i) => i.name === ifaceName(input.iface), 'scan interface'); if (iface.type?.includes('AP')) throw new Error('Choose a non-AP scan interface'); return iface },
    project: (input) => ({ action: 'bring interface up and scan', iface: input.iface }),
    run: async (input) => { await wifiAPI.ipLinkState(input.iface, 'up'); return redactNetwork(await wifiAPI.iwScan(input.iface)) },
    verify: async (_input, _before, result) => verify(null, 'Scan response returned; this is an observation, not a persistent configuration change', result) },
  { id: 'network.wifi.ssid.set', ...write('Rename only the selected primary SSID', [WIFI], object({ iface: ifaceField, ssid: ssidField }, ['iface', 'ssid']), [source('components/Wifi/WifiHostapd.js', 328)]),
    snapshot: (input) => wifiAPI.config(ifaceName(input.iface)),
    project: (input, before) => ({ ...before, ssid: input.ssid }),
    run: async (input, context) => { await wifiAPI.updateConfig(input.iface, context.before.backend === 'rustap' ? { ssid: input.ssid } : { Ssid: input.ssid }); return accepted('SSID update accepted; clients may reconnect') },
    verify: async (input) => { const config = await wifiAPI.config(input.iface); return verify(config.ssid === input.ssid, 'Re-read selected SSID', config) } },
  { id: 'network.wifi.radio.disable', ...write('Disable only the selected AP', [WIFI], ifaceInput, [source('api/Wifi.js', 612)]),
    snapshot: selectedInterface, project: (_input, before) => ({ ...before, Enabled: false }),
    run: async (input) => { await wifiAPI.disableInterface(input.iface); return accepted('Selected AP disabled; attached clients may disconnect') },
    verify: async (input) => { const data = await selectedInterface(input); return verify(data.Enabled === false, 'Re-read selected interface enablement', data) } },
  { id: 'network.wifi.guest.disable', ...write('Disable only the selected extra guest BSS', [WIFI], ifaceInput, [source('api/Wifi.js', 624)]),
    snapshot: selectedInterface, project: (_input, before) => ({ ...before, ExtraBSS: [] }),
    run: async (input) => { await wifiAPI.disableExtraBSS(input.iface); return accepted('Selected guest BSS disabled') },
    verify: async (input, before) => { const data = await selectedInterface(input); return verify(!(data.ExtraBSS || []).length && data.Enabled === before.Enabled, 'Re-read guest BSS and parent enablement', data) } },
  { id: 'network.wifi.guest.setup', ...ui('Configure guest credentials and security in the WiFi form', [WIFI], '/admin/wireless', 'Select the intended compatible interface and Guest Network. Enter or generate any password in that form. Preserve the primary SSID; verify extra-BSS and client permissions separately.', [source('components/Wifi/WifiGuestNetworkParameters.js', 198)]) },
  { id: 'network.vpn.status', ...read('Read Wireguard listener status', [VPN], empty, () => wireguardAPI.status(), [source('api/Wireguard.js', 12)]) },
  { id: 'network.vpn.peers', ...read('Read Wireguard peers, handshake and counters', [VPN], empty, () => wireguardAPI.peers(), [source('api/Wireguard.js', 9)]) },
  { id: 'network.vpn.endpoints', ...read('Read default Wireguard endpoints', [VPN], empty, () => wireguardAPI.getEndpoints(), [source('api/Wireguard.js', 31)]) },
  { id: 'network.vpn.endpoints.change', ...write('Add or remove one default Wireguard endpoint', [VPN], object({ endpoint: { ...string(), minLength: 1, maxLength: 253 }, action: enumValue(['add', 'remove']) }, ['endpoint', 'action']), [source('views/Wireguard.js', 82)]),
    snapshot: () => wireguardAPI.getEndpoints(),
    project: (input, before) => input.action === 'add' ? [...new Set([...(before || []), input.endpoint])] : (before || []).filter((e) => e !== input.endpoint),
    run: async (input, context) => { const endpoints = input.action === 'add' ? [...new Set([...(context.before || []), input.endpoint])] : (context.before || []).filter((e) => e !== input.endpoint); await wireguardAPI.setEndpoints(endpoints); return accepted('Default endpoint list saved') },
    verify: async (input) => { const endpoints = await wireguardAPI.getEndpoints(); return verify(endpoints.includes(input.endpoint) === (input.action === 'add'), 'Re-read default endpoints', endpoints) } },
  { id: 'network.vpn.peer.remove', ...write('Remove one Wireguard peer by public key', [VPN], object({ publicKey: string() }, ['publicKey']), [source('components/Wireguard/PeerList.js', 75)]),
    snapshot: peerSnapshot, project: (_input, before) => ({ action: 'remove', peer: before }),
    run: async (_input, context) => { await wireguardAPI.deletePeer(clone(context.before)); return accepted('Selected peer removed') },
    verify: async (input) => verify(!peerList(await wireguardAPI.peers()).some((p) => p.PublicKey === input.publicKey), 'Re-read peer list by public key') },
  { id: 'network.vpn.peer.setup', ...ui('Create or import peer key material in the VPN form', [VPN], '/admin/wireguard', 'Choose the exact device, public peer identity and allowed-address scope. Generate/import keys in Add Peer; deliver private configuration through the form, never chat. Verify the resulting public key, handshake and counters.', [source('components/Wireguard/WireguardAddPeer.js', 142)]) },
  { id: 'network.vpn.peer.add_public', ...write('Add a peer using supplied public key and explicit allowed-address scope', [VPN],
    object({ publicKey: { ...string(), pattern: '^[A-Za-z0-9+/]{43}=$' }, allowedIPs: string(), endpoint: string() }, ['publicKey', 'allowedIPs', 'endpoint']), [source('components/Wireguard/WireguardAddPeer.js', 142)]),
    snapshot: async (input) => { const addresses = input.allowedIPs.split(',').map((v) => v.trim()); if (!addresses.length) throw new Error('Allowed addresses required'); addresses.forEach((v) => validIP(v, true)); const peers = peerList(await wireguardAPI.peers()); if (peers.some((p) => p.PublicKey === input.publicKey)) throw new Error('Peer already exists'); return peers },
    project: (input) => ({ action: 'add peer', PublicKey: input.publicKey, AllowedIPs: input.allowedIPs, Endpoint: input.endpoint, devicePoliciesChanged: false }),
    run: async (input) => { await wireguardAPI.putPeer({ PublicKey: input.publicKey, AllowedIPs: input.allowedIPs, Endpoint: input.endpoint }); return accepted('Public-key peer configuration saved; handshake not yet established') },
    verify: async (input) => { const peers = peerList(await wireguardAPI.peers()); return verify(peers.some((p) => p.PublicKey === input.publicKey && p.AllowedIPs === input.allowedIPs), 'Re-read peer configuration, not connectivity', peers) } },
  { id: 'network.vpn.site.setup', ...ui('Import site-tunnel secrets in the VPN form', [VPN], '/admin/wireguard', 'Use Site VPN to enter Address, PeerPublicKey, PrivateKey, optional PresharedKey, Endpoint and DNS. After the secure setup, create a separately reviewed PFW route for the requested destination CIDR; do not default it to all traffic.', [source('components/Wireguard/WireguardAddSite.js', 56)]) },
  { id: 'network.dhcp.config', ...read('Read allocation networks and lease time', [DHCP, LINK], empty, dhcpConfiguration, [source('views/Supernetworks.js', 49)]) },
  { id: 'network.dhcp.connected', ...read('Read DHCP-table evidence without conflating missing and empty data', [DHCP, OVERVIEW], empty,
    async () => ({ verdictMap: await nfmapAPI.getNFVerdictMap('ethernet_filter'), arp: await wifiAPI.arp(), devices: await deviceAPI.list(), limitation: 'These are current connection observations, not a complete live lease or historical ownership table.' }), [source('views/Groups/Dhcp.js', 14)]) },
  { id: 'network.dhcp.lease.set', ...write('Change only DHCP lease duration', [DHCP], object({ leaseTime: { ...string(), pattern: '^(?:[0-9]{1,2}h)?(?:[0-9]{1,2}m)?(?:[0-9]{1,2}s)?$', minLength: 2 } }, ['leaseTime']), [source('views/Supernetworks.js', 49), 'api/code/dhcp.go:250']),
    snapshot: async (input) => { leaseDuration(input.leaseTime); return dhcpConfiguration() }, project: (input, before) => ({ ...before, LeaseTime: leaseDuration(input.leaseTime) }),
    run: async (input, context) => { await api.put('/subnetConfig', { ...context.before, LeaseTime: leaseDuration(input.leaseTime) }); return accepted('Lease configuration saved; clients renew on their own schedules') },
    verify: async (input, before) => { const data = await dhcpConfiguration(); return verify(data.LeaseTime === leaseDuration(input.leaseTime) && JSON.stringify(data.TinyNets) === JSON.stringify(before.TinyNets), 'Re-read lease duration and preserved allocation ranges', data) } },
  { id: 'network.dhcp.range.change', ...write('Add or remove one allocation range after checking overlap with existing ranges, interfaces and device addresses', [DHCP],
    object({ cidr: ipField, action: enumValue(['add', 'remove']), allocationAndOverlapEvidence: string() }, ['cidr', 'action']), [source('views/Supernetworks.js', 49)]),
    snapshot: allocationSnapshot,
    project: (input, before) => ({ configuration: { ...before.Config, TinyNets: input.action === 'add' ? [...before.Config.TinyNets, input.cidr] : before.Config.TinyNets.filter((n) => n !== input.cidr) } }),
    run: async (input, context) => { const previous = context.before.Config; const config = { ...previous, TinyNets: input.action === 'add' ? [...previous.TinyNets, input.cidr] : previous.TinyNets.filter((n) => n !== input.cidr) }; await api.put('/subnetConfig', config); return accepted('Allocation range configuration saved; client renewal is a separate check') },
    verify: async (input, before) => { const data = { Config: await dhcpConfiguration() }; const expected = input.action === 'add' ? [...before.Config.TinyNets, input.cidr] : before.Config.TinyNets.filter((cidr) => cidr !== input.cidr); return verify(JSON.stringify(data.Config.TinyNets) === JSON.stringify(expected) && data.Config.LeaseTime === before.Config.LeaseTime, 'Re-read allocation ranges and lease time', data) } },
  { id: 'network.link.ppp.profiles', ...read('Read saved PPP uplink profiles; account details are redacted and enabled is not connected', [LINK], empty, async () => {
    const value = await api.get('/uplink/ppp')
    return { ...value, PPPs: value.PPPs?.map(({ Username, ...profile }) => ({ ...profile, ...(Username !== undefined ? { Username: '[redacted]' } : {}) })) }
  }, [source('views/LinkConfiguration/UplinkConfiguration.js', 690)]) },
  { id: 'network.link.wifi.profiles', ...read('Read saved uplink WiFi profile metadata', [LINK], empty, () => api.get('/uplink/wifi'), [source('views/LinkConfiguration/UplinkConfiguration.js', 145)]) },
  { id: 'network.link.wifi.open', ...write('Change only one saved uplink profile to open authentication', [LINK], profileInput, [source('views/LinkConfiguration/UplinkConfiguration.js', 114)]),
    snapshot: selectedProfile,
    project: (input, before) => ({ ...before, Networks: before.Networks.map((n) => profileMatches(n, input) ? { ...n, KeyMgmt: 'NONE', Password: '' } : n) }),
    run: async (input, context) => { const entry = clone(context.before); entry.Networks = entry.Networks.map((n) => profileMatches(n, input) ? { ...n, KeyMgmt: 'NONE', Password: '' } : n); await api.put('/uplink/wifi', entry); return accepted('Selected profile saved as Open; wireless link encryption is absent') },
    verify: async (input) => { const entry = await selectedProfile(input); const selected = entry.Networks.find((n) => profileMatches(n, input)); return verify(selected.KeyMgmt === 'NONE' && !selected.Password, 'Re-read authentication mode and cleared password', entry) } },
  { id: 'network.link.wifi.profile.remove', ...write('Remove one saved profile and preserve all other profiles', [LINK], profileInput, [source('views/LinkConfiguration/UplinkConfiguration.js', 943), 'api/code/uplink.go:246']),
    snapshot: selectedProfile, project: (input, before) => ({ ...before, Networks: before.Networks.filter((n) => !profileMatches(n, input)) }),
    run: async (input, context) => { const entry = clone(context.before); entry.Networks = entry.Networks.filter((n) => !profileMatches(n, input)); await api.put('/uplink/wifi', entry); return accepted('Selected saved profile removed') },
    verify: async (input) => { const data = await api.get('/uplink/wifi'); const entry = selectOne(data.WPAs, (w) => w.Iface === input.iface, 'uplink interface'); return verify(!entry.Networks?.some((n) => profileMatches(n, input)), 'Re-read saved profiles', entry) } },
  { id: 'network.link.wifi.connect', ...ui('Enter uplink WiFi credentials in the selected profile form', [LINK], '/admin/uplink', 'Choose the exact interface and, when requested, BSSID. Enter the password in Configure Wireless. The assistant can read scan/profile metadata and verify the result without receiving the password.', [source('views/LinkConfiguration/UplinkConfiguration.js', 75)]) },
  { id: 'network.link.uplink.static', ...write('Set an explicit static address and gateway on one uplink', [LINK],
    object({ iface: ifaceField, address: ipField, router: ipField, alternativeManagementPath: { ...string(), minLength: 1 } }, ['iface', 'address', 'router', 'alternativeManagementPath']), interfaceSources),
    snapshot: async (input) => { validIP(input.address, true); validIP(input.router); const before = await selectedInterface(input); if (before.Type !== 'Uplink') throw new Error('Select an uplink'); if (before.VLAN) throw new Error('The uplink IP endpoint does not support a configured VLAN; do not silently clear it'); return before },
    project: (input, before) => ({ ...before, DisableDHCP: true, IP: input.address, Router: input.router, reviewedAlternativeManagementPath: input.alternativeManagementPath }),
    run: async (input, context) => { await api.put('/uplink/ip', { ...linkIPConfig(context.before), DisableDHCP: true, IP: input.address, Router: input.router }); return accepted('Static uplink configuration saved; connectivity needs independent verification') },
    verify: async (input, before) => { const data = await selectedInterface(input); return verify(sameLinkIPConfig(data, { ...before, DisableDHCP: true, IP: input.address, Router: input.router }), 'Re-read static uplink fields and preserved IP settings', data) } },
  { id: 'network.link.role.downlink', ...write('Convert one selected uplink to downlink after reviewing alternate access and addressing', [LINK],
    object({ iface: ifaceField, alternativeManagementPath: { ...string(), minLength: 1 }, downlinkAddressingPlan: { ...string(), minLength: 1 } }, ['iface', 'alternativeManagementPath', 'downlinkAddressingPlan']), interfaceSources),
    snapshot: async (input) => { const current = await selectedInterface(input); if (current.Type !== 'Uplink') throw new Error('Select a current uplink'); return current },
    project: (input, before) => ({ ...before, Type: 'Downlink', reviewedAlternativeManagementPath: input.alternativeManagementPath, reviewedDownlinkAddressingPlan: input.downlinkAddressingPlan, note: 'This operation changes the role only; address changes require a separate reviewed operation.' }),
    run: async (input, context) => { await api.put('/link/config', { ...context.before, Name: input.iface, Type: 'Downlink' }); return accepted('Selected interface role changed to Downlink') },
    verify: async (input) => { const data = await selectedInterface(input); return verify(data.Type === 'Downlink', 'Re-read role; successful API read does not establish downstream connectivity', data) } },
  { id: 'network.link.downlink.address.add', ...write('Append one IPv4 downlink address after checking local overlap', [LINK], object({ iface: ifaceField, address: ipField, router: string() }, ['iface', 'address']), interfaceSources),
    snapshot: async (input) => {
      validIP(input.address, true); if (input.router) validIP(input.router)
      if (input.address.includes(':') || input.router?.includes(':')) throw new Error('This address operation supports IPv4 only')
      const interfaces = await wifiAPI.interfacesConfiguration()
      const current = selectOne(interfaces, (entry) => entry.Name === ifaceName(input.iface), 'interface')
      if (current.Type !== 'Downlink') throw new Error('Select a downlink')
      assertNoObservedOverlap(input.address, observedNetworks(interfaces, input.iface))
      assertNoObservedOverlap(input.address, (await dhcpConfiguration()).TinyNets)
      return current
    },
    project: (input, before) => ({ ...before, AdditionalIPs: [...(before.AdditionalIPs || []), { IP: input.address, Router: input.router || '' }] }),
    run: async (input, context) => { if (context.before.AdditionalIPs?.some((a) => a.IP === input.address)) return accepted('Address already present; no change'); await api.put('/link/ip', { ...linkIPConfig(context.before), AdditionalIPs: [...(context.before.AdditionalIPs || []), { IP: input.address, Router: input.router || '' }] }); return accepted('Additional address saved after local IPv4 overlap review; reachability needs independent verification') },
    verify: async (input, before) => { const data = await selectedInterface(input); const expected = before.AdditionalIPs?.some((a) => a.IP === input.address) ? before : { ...before, AdditionalIPs: [...(before.AdditionalIPs || []), { IP: input.address, Router: input.router || '' }] }; return verify(sameLinkIPConfig(data, expected) && data.AdditionalIPs?.some((a) => a.IP === input.address && (a.Router || '') === (input.router || '')) === true, 'Re-read additional address and preserved IP settings', data) } },
  { id: 'network.link.api.disable', ...write('Disable API access on one downlink', [LINK], object({ iface: ifaceField, alternativeManagementPath: { ...string(), minLength: 1 } }, ['iface', 'alternativeManagementPath']), interfaceSources),
    snapshot: async (input) => { const current = await selectedInterface(input); if (current.Type !== 'Downlink') throw new Error('Select a downlink'); return current },
    project: (input, before) => ({ ...before, DisableAPI: true, reviewedAlternativeManagementPath: input.alternativeManagementPath }),
    run: async (input, context) => { await api.put('/link/ip', { ...linkIPConfig(context.before), DisableAPI: true }); return accepted('Selected downlink API access disabled') },
    verify: async (input, before) => { const data = await selectedInterface(input); return verify(sameLinkIPConfig(data, { ...before, DisableAPI: true }), 'Re-read downlink API flag and preserved IP settings', data) } },
  { id: 'network.wan.status', ...read('Read WAN health status and sample timestamps', [WAN, LINK], empty, () => wanAPI.status(), [source('api/Wan.js', 8)]) },
  { id: 'network.wan.config', ...read('Read monitoring and failover configuration', [WAN], empty, () => wanAPI.config(), [source('api/Wan.js', 24)]) },
  { id: 'network.wan.history', ...read('Read a bounded WAN health history', [WAN], object({ iface: ifaceField, scale: enumValue(['minutes', 'hours']), count: { ...integer(), minimum: 1, maximum: 1440 } }, ['iface', 'scale', 'count']),
    (input) => wanAPI.history(ifaceName(input.iface), input.scale, input.count), [source('api/Wan.js', 12)]) },
  { id: 'network.wan.outages', ...read('Read timestamped WAN outages', [WAN], empty, () => wanAPI.outages(), [source('api/Wan.js', 20)]) },
  { id: 'network.wan.monitoring.set', ...write('Change monitoring and explicitly requested failover only', [WAN], object({ enabled: boolean(), failoverEnabled: boolean() }, ['enabled']), [source('api/Wan.js', 28), source('views/WanHealth.js', 565)]),
    snapshot: () => wanAPI.config(),
    project: (input, before) => ({ ...before, Enabled: input.enabled, ...(input.failoverEnabled === undefined ? {} : { FailoverEnabled: input.failoverEnabled }) }),
    run: async (input, context) => { const data = { ...context.before, Enabled: input.enabled, ...(input.failoverEnabled === undefined ? {} : { FailoverEnabled: input.failoverEnabled }) }; if (data.FailoverEnabled && !data.Enabled) throw new Error('Failover requires monitoring'); await wanAPI.setConfig(data); return accepted('Monitoring configuration saved') },
    verify: async (input, before) => { const data = await wanAPI.config(); return verify(data.Enabled === input.enabled && data.FailoverEnabled === (input.failoverEnabled ?? before.FailoverEnabled), 'Re-read monitoring and failover flags', data) } },
  { id: 'network.wan.speed.results', ...read('Read measured WAN speed test results', [WAN], empty, () => wanAPI.speedResults(), [source('api/Wan.js', 32)]) },
  { id: 'network.wan.speed.run', ...write('Run a measured speed test on one WAN without changing preferred routing', [WAN], ifaceInput, [source('api/Wan.js', 36)]),
    snapshot: async (input) => { const current = await selectedInterface(input); if (current.Type !== 'Uplink' || !current.Enabled) throw new Error('Select an enabled uplink'); return current },
    project: (input) => ({ action: 'download a test payload through selected WAN', iface: input.iface, changesRoutingPreference: false }),
    run: async (input) => redactNetwork(await wanAPI.runSpeedTest(input.iface)),
    verify: async (_input, _before, result) => verify(!!result && !result.Error && Number.isFinite(result.DownMbps), 'Inspect the measured test result; report Mbps and selected interface', result) },
  { id: 'network.plugins.availability', ...read('Read plugin availability and PLUS entitlement validity without token material', [MESH, VPN], empty,
    async () => ({ plugins: await pluginAPI.list(), plusValid: await pluginAPI.validPlusToken() }), [source('api/Plugin.js', 10), source('api/Plugin.js', 30)]) },
  { id: 'network.mesh.mode', ...read('Read whether SPR is configured as a mesh leaf', [MESH], empty, () => meshAPI.leafMode(), [source('views/Mesh.js', 74)]) },
  { id: 'network.mesh.config', ...read('Read mesh configuration with credentials redacted', [MESH], empty, () => meshAPI.config(), [source('api/mesh.js', 8)]) },
  { id: 'network.mesh.leaves', ...read('Read enrolled mesh leaf identities with credentials redacted', [MESH], empty, () => meshAPI.leafRouters(), [source('api/mesh.js', 20)]) },
  { id: 'network.mesh.health', ...read('Check base and mesh APIs for one enrolled leaf', [MESH], object({ ip: ipField }, ['ip']), async (input) => leafHealth(await selectedLeaf(input)), [source('views/Mesh.js', 103)]) },
  { id: 'network.mesh.stations', ...read('Read WiFi client signal and rates from every enrolled mesh node', [MESH, WIFI], empty, meshStations, [source('components/Wifi/WifiClients.js', 51)]) },
  { id: 'network.mesh.macsec', ...read('Read live MACsec/backhaul status', [MESH], empty, () => meshAPI.macsecStatus(), [source('api/mesh.js', 44)]) },
  { id: 'network.mesh.enroll', ...ui('Enroll a mesh node through the secure authentication workflow', [MESH], '/admin/mesh', 'Verify the leaf identity and parent address, then enter its API token only in Add Mesh AP. Complete OTP validation if prompted. This workflow configures parent credentials, leaf mode, enrollment and synchronization; re-read enrolled leaves and MACsec status afterwards.', [source('components/Mesh/AddLeafRouter.js', 84)]) },
  { id: 'network.mesh.ssid.sync', ...write('Synchronize SSID across the parent and enrolled mesh APs', [MESH], object({ ssid: ssidField }, ['ssid']), [source('views/Mesh.js', 217)]),
    snapshot: async () => ({ leaves: await meshAPI.leafRouters(), local: await ssidsFor(wifiAPI) }),
    project: (input, before) => ({ action: 'mesh-wide SSID synchronization', ssid: input.ssid, leaves: before.leaves.map((l) => l.IP), localAPs: before.local }),
    run: async (input) => { await meshAPI.setSSID(input.ssid); return accepted('SSID synchronization requested; verify each node') },
    verify: async (input, before) => {
      const results = []
      for (const leaf of before.leaves) { try { const radios = await ssidsFor(leafClient(APIWifi, leaf)); results.push({ IP: leaf.IP, radios, matches: radios.length > 0 && radios.every((r) => r.ssid === input.ssid) }) } catch (_) { results.push({ IP: leaf.IP, matches: false, error: 'Node verification unavailable' }) } }
      const local = await ssidsFor(wifiAPI)
      return verify(local.length > 0 && local.every((r) => r.ssid === input.ssid) && results.every((r) => r.matches), 'Verified each reachable node; unavailable nodes remain unverified', { local, leaves: results })
    } },
  { id: 'network.mesh.otp.sync', ...write('Synchronize OTP across enrolled mesh APs without exposing secrets', [MESH], empty, [source('views/Mesh.js', 226)]),
    snapshot: () => meshAPI.leafRouters(), project: (_input, before) => ({ action: 'OTP synchronization', affectedLeaves: before.map((l) => l.IP), requiresExistingOTPAuthorization: true }),
    run: async () => { await meshAPI.syncOTP(); return accepted('OTP synchronization accepted; no secret material returned') },
    verify: async () => verify(null, 'The UI exposes no independent secret-free per-node OTP equivalence check; API acceptance is not proof that every node synchronized') },
  { id: 'network.mesh.otp.authorize', ...ui('Complete existing OTP validation in the authentication view', [MESH], '/auth/validate', 'Complete the app’s OTP verification. Return to MESH and review synchronization; never put an OTP seed, private token or credential in assistant messages.', [source('components/Mesh/AddLeafRouter.js', 103)]) },
  { id: 'network.mesh.leaf.remove', ...write('Remove exactly one enrolled mesh leaf', [MESH], object({ ip: ipField }, ['ip']), [source('views/Mesh.js', 183)]),
    snapshot: selectedLeaf, project: (_input, before) => ({ action: 'remove leaf', IP: before.IP }),
    run: async (_input, context) => { await meshAPI.delLeafRouter(clone(context.before)); return accepted('Selected leaf removed') },
    verify: async (input) => verify(!(await meshAPI.leafRouters()).some((l) => l.IP === input.ip), 'Re-read enrolled leaf identities') },
  { id: 'network.mesh.jumbo.set', ...write('Set jumbo frames on one reviewed wired backhaul path', [MESH], object({ ip: ipField, jumbo: boolean(), pathEvidence: { ...string(), minLength: 1 } }, ['ip', 'jumbo', 'pathEvidence']), [source('components/Mesh/MeshMACsec.js', 105)]),
    snapshot: selectedLeaf, project: (input, before) => ({ action: 'set wired backhaul jumbo frames', IP: before.IP, Jumbo: input.jumbo, reviewedPathEvidence: input.pathEvidence }),
    run: async (input) => { await meshAPI.setLeafJumbo({ IP: input.ip, Jumbo: input.jumbo }); return accepted('Selected wired backhaul jumbo setting requested') },
    verify: async () => verify(null, 'Read MACsec status and verify the full path; no switch capability probe is provided by the frontend', await meshAPI.macsecStatus()) },
  { id: 'network.traffic.flows', ...read('Read current traffic flows, optionally scoped to one current IP', [TRAFFIC], object({ ip: ipField }), async (input) => {
    if (input.ip) validIP(input.ip)
    const result = await trafficAPI.traffic()
    return input.ip ? (result || []).filter((row) => row.Src === input.ip || row.Dst === input.ip) : result
  }, [source('api/Traffic.js', 8), source('views/Traffic/TrafficList.js', 112)]) },
  { id: 'network.traffic.maps', ...read('Read incoming or outgoing LAN/WAN byte counters', [TRAFFIC], object({ direction: enumValue(['incoming', 'outgoing']), network: enumValue(['lan', 'wan']) }, ['direction', 'network']),
    (input) => trafficAPI.traffic(`${input.direction}_traffic_${input.network}`), [source('views/Traffic/Traffic.web.js', 169)]) },
  { id: 'network.traffic.history', ...read('Read bounded traffic history; retain gaps and timestamps', [TRAFFIC], windowInput, (input) => trafficAPI.history(input.minutes), [source('api/Traffic.js', 17)]) },
  { id: 'network.traffic.insights.overview', ...read('Read destination country, ASN and device aggregates for a selected window', [TRAFFIC], windowInput, (input) => trafficInsightsAPI.overview(input.minutes), [source('api/TrafficInsights.js', 16)]) },
  { id: 'network.traffic.insights.device', ...read('Read destination insights for one IP and time window', [TRAFFIC], object({ ip: ipField, minutes: { ...integer(), minimum: 1, maximum: 10080 } }, ['ip', 'minutes']),
    (input) => { validIP(input.ip); return trafficInsightsAPI.device(input.ip, input.minutes) }, [source('api/TrafficInsights.js', 21)]) },
  { id: 'network.traffic.collection.config', ...read('Read traffic-insights collection configuration', [TRAFFIC], empty, () => trafficInsightsAPI.config(), [source('api/TrafficInsights.js', 8)]) },
  { id: 'network.geo.config', ...read('Read global country and ASN block configuration', [TRAFFIC], empty, () => geoBlockAPI.config(), [source('api/GeoBlock.js', 8)]) },
  { id: 'network.geo.country.block', ...write('Add one global country block without changing other rules', [TRAFFIC], object({ country: { ...string(), pattern: '^[A-Z]{2}$' } }, ['country']), [source('api/GeoBlock.js', 24)]),
    snapshot: () => geoBlockAPI.config(), project: (input, before) => ({ ...before, DenyCountries: [...new Set([...(before.DenyCountries || []), input.country])], scope: 'global geography policy' }),
    run: async (input) => { await geoBlockAPI.blockCountry(input.country); return accepted('Country rule saved; enforcement also depends on global geo-block enablement') },
    verify: async (input) => { const data = await geoBlockAPI.config(); return verify(data.DenyCountries?.includes(input.country) === true, 'Re-read country rule; saved and enforced are separate claims', data) } },
  { id: 'network.geo.asn.unblock', ...write('Remove one ASN block and preserve country rules', [TRAFFIC], object({ asn: { ...string(), pattern: '^[0-9]{1,10}$' } }, ['asn']), [source('api/GeoBlock.js', 36)]),
    snapshot: () => geoBlockAPI.config(), project: (input, before) => ({ ...before, DenyASNs: (before.DenyASNs || []).filter((a) => String(a.ASN) !== input.asn) }),
    run: async (input) => { await geoBlockAPI.unblockASN(input.asn); return accepted('Selected ASN block removed') },
    verify: async (input, before) => { const data = await geoBlockAPI.config(); return verify(!(data.DenyASNs || []).some((a) => String(a.ASN) === input.asn) && JSON.stringify(data.DenyCountries) === JSON.stringify(before.DenyCountries), 'Re-read ASN removal and preserved country rules', data) } },
  { id: 'network.dhcp.history', ...read('Read retained DHCP response events for historical address attribution', [DHCP, TRAFFIC], object({ count: { ...integer(), minimum: 1, maximum: 500 }, from: string(), to: string() }, ['count', 'from', 'to']), async (input) => {
    if (!Number.isFinite(Date.parse(input.from)) || !Number.isFinite(Date.parse(input.to)) || Date.parse(input.from) >= Date.parse(input.to)) throw new Error('A valid ordered historical time interval is required')
    const buckets = await dbAPI.buckets()
    if (!Array.isArray(buckets) || !buckets.includes('dhcp:response')) throw new Error('Retained dhcp:response bucket unavailable; historical ownership remains unknown')
    return { events: await dbAPI.items('dhcp:response', { num: input.count, min: input.from, max: input.to }), limitation: 'Bounded retained events may be incomplete; absence does not prove no assignment.' }
  }, [source('api/Db.js', 28), source('components/Logs/LogListItem.js', 220), source('components/Logs/LogListDb.js', 134)]) }
]
