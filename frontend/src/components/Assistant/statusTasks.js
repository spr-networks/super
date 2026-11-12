import { getApiURL } from 'api'
import { object, string, integer, validateInput } from './operationSchema'
import { taskReceipt, matchRef } from './taskRuntime'

const need = (ok, message) => { if (!ok) throw new Error(message) }
const list = value => value === null ? [] : Array.isArray(value) ? value : null
const strings = value => { const a = list(value); return a && a.every(v => typeof v === 'string') ? a : null }
const identity = d => d.MAC || d.WGPubKey
const named = d => d.Name || identity(d)
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0
const sorted = values => [...values].sort(order)
const join = values => values.length ? values.join(', ') : 'none'
const orMissing = values => values === null ? 'not returned' : join(values)
const authLabel = type => type === 'sae' ? 'sae (WPA3; WPA2 is also accepted)' : type
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const listFilters = ['policy', 'group', 'tag']
const NAME_LIMIT = 40

const deviceField = string({ minLength: 1, maxLength: 2048, description: 'Exact device name, MAC or WireGuard public key as the user gave it.' })
const deviceSchema = object({ device: deviceField }, ['device'])
const noInput = object({}, [])
const filterField = what => string({ minLength: 1, maxLength: 256, description: `Exact ${what} name to filter by.` })

export const fillAlertTemplate = (template, event, devices = []) => typeof template !== 'string' ? '' : !event ? template
  : template.replace(/\{\{([\w.]+)(?:#(\w+))?\}\}/g, (match, path, tag) => {
    if (match.includes('__')) return ''
    let value = event
    for (const level of path.split('.')) { if (value && value[level]) value = value[level]; else { value = ''; break } }
    value = typeof value === 'object' ? JSON.stringify(value) : String(value)
    if (!tag || !tag.startsWith('Device') || !value) return value
    const isMac = value.split(':').length === 6, key = isMac ? value.toLowerCase() : value.replace(/:.*/, '')
    const device = devices.find(d => isMac ? typeof d.MAC === 'string' && d.MAC.toLowerCase() === key : d.RecentIP === key)
    return device?.Name || value
  }).replace(/\s+/g, ' ').trim()

const oneDevice = async (load, device) => {
  const all = list(await load('devices.list')); need(all, 'Device inventory unavailable')
  let matches = all.filter(d => d.Name === device || d.WGPubKey === device || typeof d.MAC === 'string' && d.MAC.toLowerCase() === device.toLowerCase())
  const folded = device.trim().toLowerCase()
  if (!matches.length) matches = all.filter(d => typeof d.Name === 'string' && d.Name.trim().toLowerCase() === folded)
  if (matches.length !== 1) {
    const near = all.map(d => d.Name).filter(n => typeof n === 'string' && n && folded && n.toLowerCase().includes(folded)).slice(0, 5)
    need(false, matches.length > 1
      ? `${matches.length} saved devices match "${device.slice(0, NAME_LIMIT)}". Use the MAC address to select one`
      : `No saved device is named "${device.slice(0, NAME_LIMIT)}" (${all.length} devices checked)${near.length ? `. Similar names: ${near.join(', ')}` : ''}. Use the exact device name, MAC or public WireGuard identity`)
  }
  const d = matches[0]; need(identity(d), 'Device identity unavailable')
  return { d, all, facts: { device: { identity: identity(d), name: named(d) } } }
}

const TASKS = [
  { id: 'tasks.devices.internet_status', label: 'Internet permission of one device: can it get online, is wan access allowed',
    description: 'Answer whether the saved policies of one exact device include internet (wan) permission. This is the saved permission, not a live connectivity test.',
    menus: ['Devices'], needs: ['devices.list'], schema: deviceSchema,
    answer: async ({ device }, load) => {
      const { d, facts } = await oneDevice(load, device), p = strings(d.Policies)
      facts.policies = p === null ? null : sorted(p); facts.internetAllowed = p === null ? null : p.includes('wan')
      if (p === null) return { facts, complete: false, message: `${named(d)}: internet permission is unknown because policies were not returned.` }
      const wan = `wan is ${p.includes('wan') ? 'present' : 'absent'}`, allowlist = p.filter(x => x.startsWith('allowlist:')).map(x => x.slice('allowlist:'.length))
      const overridden = p.includes('disabled') ? 'disabled' : p.includes('quarantine') ? 'quarantined' : null
      if (overridden) { facts.internetAllowed = false; facts.overriddenBy = overridden; return { facts, complete: true, message: `${named(d)}: the device is ${overridden}, so it has no internet access (${wan}).` } }
      if (!facts.internetAllowed && allowlist.length) { facts.allowlists = sorted(allowlist); return { facts, complete: true, message: `${named(d)}: internet is restricted to the allowlist ${join(facts.allowlists)} (${wan}).` } }
      return { facts, complete: true, message: `${named(d)}: internet permission is ${facts.internetAllowed ? 'enabled (wan is present)' : 'disabled (wan is absent)'}.` }
    } },
  { id: 'tasks.devices.policies', label: 'Saved policies of one device',
    description: 'List every saved access policy name on one exact device.',
    menus: ['Devices'], needs: ['devices.list'], schema: deviceSchema,
    answer: async ({ device }, load) => {
      const { d, facts } = await oneDevice(load, device), p = strings(d.Policies)
      facts.policies = p === null ? null : sorted(p)
      return { facts, complete: p !== null, message: p === null ? `${named(d)}: policies were not returned.` : `${named(d)} policies: ${join(facts.policies)}.` }
    } },
  { id: 'tasks.devices.groups', label: 'Groups assigned to one device (group membership)',
    description: 'List the saved group memberships of one exact device.',
    menus: ['Devices', 'Groups'], needs: ['devices.list'], schema: deviceSchema,
    answer: async ({ device }, load) => {
      const { d, facts } = await oneDevice(load, device), groups = strings(d.Groups)
      facts.groups = groups === null ? null : sorted(groups)
      return { facts, complete: groups !== null, message: groups === null ? `${named(d)}: group membership was not returned.` : `${named(d)} groups: ${join(facts.groups)}.` }
    } },
  { id: 'tasks.devices.group_peers', label: 'Other devices that belong to the same groups as one device',
    description: 'List the other saved devices that have at least one group in common with one exact device. Sharing a group is configuration, not proof the devices can reach each other.',
    menus: ['Devices', 'Groups'], needs: ['devices.list'], schema: deviceSchema,
    answer: async ({ device }, load) => {
      const { d, all, facts } = await oneDevice(load, device), groups = strings(d.Groups)
      facts.groups = groups === null ? null : sorted(groups)
      if (groups === null) return { facts, complete: false, message: `${named(d)}: group membership was not returned.` }
      facts.members = []; facts.unknownMembershipDevices = []
      for (const other of all) {
        if (identity(other) === identity(d)) continue
        const theirs = strings(other.Groups)
        if (theirs === null) { facts.unknownMembershipDevices.push(named(other)); continue }
        const sharedGroups = sorted(groups.filter(g => theirs.includes(g)))
        if (sharedGroups.length) facts.members.push({ identity: identity(other), name: named(other), sharedGroups })
      }
      facts.members.sort((a, b) => order(a.identity, b.identity))
      facts.unknownMembershipDevices = sorted(facts.unknownMembershipDevices)
      const complete = !facts.unknownMembershipDevices.length
      let message = `Other devices sharing a recorded group with ${named(d)}: ${join(facts.members.map(m => m.name))}.`
      if (!complete) message += ` Membership was unavailable for: ${join(facts.unknownMembershipDevices)}.`
      return { facts, complete, message }
    } },
  { id: 'tasks.devices.dns_lists', label: 'DNS block lists (blocklists, ad blocking filters) that apply to one device',
    description: 'List the global and tag-matching DNS block lists for one exact device with each list mode (blocking, observe-only or disabled).',
    menus: ['Devices', 'DNS'], needs: ['devices.list', 'dns.block.read'], schema: deviceSchema,
    answer: async ({ device }, load) => {
      const { d, facts } = await oneDevice(load, device)
      const config = await load('dns.block.read'), lists = list(config?.BlockLists), tags = strings(d.DeviceTags)
      need(lists, 'DNS lists unavailable'); facts.lists = []; facts.unknownScopeLists = []
      for (const entry of lists) {
        const scope = strings(entry.Tags)
        if (scope === null || scope.length && tags === null) { facts.unknownScopeLists.push(entry.URI); continue }
        if (scope.length && !scope.some(t => tags.includes(t))) continue
        const mode = entry.Enabled === false ? 'disabled' : entry.Enabled !== true ? 'unknown' : entry.DontBlock === true ? 'observe-only' : entry.DontBlock === false ? 'blocking' : 'unknown'
        facts.lists.push({ uri: entry.URI, mode, scope: scope.length ? sorted(scope) : 'global' })
      }
      facts.lists.sort((a, b) => order(a.uri, b.uri))
      facts.unknownScopeLists = sorted(facts.unknownScopeLists)
      let message = `${named(d)} DNS lists: ${join(facts.lists.map(l => `${l.uri} (${l.mode}, ${l.scope === 'global' ? 'global' : 'tags ' + l.scope.join(', ')})`))}.`
      if (facts.unknownScopeLists.length) message += ` Scope is unknown for: ${join(facts.unknownScopeLists)}.`
      const excluded = strings(config?.ClientIPExclusions), policyList = strings(d.Policies)
      if (excluded && typeof d.RecentIP === 'string' && d.RecentIP && excluded.includes(d.RecentIP)) { facts.excludedFromBlocking = true; message += ' This device is excluded from DNS blocking, so none of these lists is applied to it.' }
      const overrides = list(config?.OverrideLists)?.filter(o => o?.Enabled !== false && Array.isArray(o.PermitDomains) && o.PermitDomains.length
        && (!(strings(o.Tags) || []).length || (tags || []).some(t => strings(o.Tags).includes(t)))) || []
      if (overrides.length) { facts.permitOverrides = overrides.reduce((n, o) => n + o.PermitDomains.length, 0); message += ` ${facts.permitOverrides} permitted domain${facts.permitOverrides === 1 ? '' : 's'} in override lists take precedence over these lists.` }
      if (policyList?.includes('quarantine')) { facts.quarantined = true; message += ' This device is quarantined: its DNS lookups are redirected or refused whatever the lists say.' }
      return { facts, complete: !facts.unknownScopeLists.length && facts.lists.every(l => l.mode !== 'unknown'), message }
    } },
  { id: 'tasks.devices.entry', label: 'Saved entry (record, details, settings) of one device',
    description: 'Show the saved device entry for one exact device: MAC, last recorded address, VLAN, WiFi authentication type, policies, groups and tags. The WiFi passphrase is never shown. A recorded address does not show that the device is online.',
    menus: ['Devices'], needs: ['devices.list'], schema: deviceSchema,
    answer: async ({ device }, load) => {
      const { d, facts } = await oneDevice(load, device)
      const policies = strings(d.Policies), groups = strings(d.Groups), tags = strings(d.DeviceTags)
      facts.mac = d.MAC || null; facts.wireguard = Boolean(d.WGPubKey)
      facts.lastAddress = typeof d.RecentIP === 'string' && d.RecentIP ? d.RecentIP : null
      facts.vlan = typeof d.VLANTag === 'string' ? d.VLANTag || 'none' : null
      facts.wifiAuth = typeof d.WiFiAuthType === 'string' ? d.WiFiAuthType : null
      facts.policies = policies === null ? null : sorted(policies); facts.groups = groups === null ? null : sorted(groups); facts.tags = tags === null ? null : sorted(tags)
      return { facts, complete: policies !== null && groups !== null && tags !== null,
        message: `${named(d)}: MAC ${facts.mac || 'none'}; last recorded address ${facts.lastAddress || 'none'}; VLAN ${facts.vlan === null ? 'not returned' : facts.vlan}; WiFi authentication ${facts.wifiAuth ? authLabel(facts.wifiAuth) : 'not recorded'}; policies: ${orMissing(facts.policies)}; groups: ${orMissing(facts.groups)}; tags: ${orMissing(facts.tags)}. A recorded address does not show that the device is online.` }
    } },
  { id: 'tasks.devices.wifi_auth', label: 'WPA2 or WPA3 (SAE) WiFi security setting of one device',
    description: 'Show the configured WiFi authentication type of one exact device: sae (WPA3) or wpa2. This is the saved setting, not the security negotiated on its current connection.',
    menus: ['Devices', 'WiFi'], needs: ['devices.list'], schema: deviceSchema,
    answer: async ({ device }, load) => {
      const { d, facts } = await oneDevice(load, device)
      facts.configuredAuth = typeof d.WiFiAuthType === 'string' ? d.WiFiAuthType : null
      return { facts, complete: true, message: facts.configuredAuth
        ? `${named(d)}: configured WiFi authentication is ${authLabel(facts.configuredAuth)}. This is the saved setting, not the security negotiated on its current connection.`
        : `${named(d)}: no WiFi authentication type is recorded. Wired, VPN and guest-network devices have none.` }
    } },
  { id: 'tasks.devices.wifi_signal', label: 'WiFi signal strength (RSSI in dBm) and WiFi channel of one device',
    description: 'Read the WiFi signal strength (RSSI in dBm), WiFi channel and frequency of one exact device from the access points, including mesh nodes. Only for signal or channel questions.',
    menus: ['Devices', 'WiFi'], needs: ['devices.list', 'network.wifi.capabilities', 'network.wifi.stations', 'network.wifi.status', 'network.mesh.stations'], schema: deviceSchema,
    answer: async ({ device }, load) => {
      const { d, facts } = await oneDevice(load, device)
      Object.assign(facts, { connected: null, accessPointsChecked: [], accessPointsFailed: [], meshNodesChecked: [], meshNodesUnreachable: [] })
      if (typeof d.MAC !== 'string' || !d.MAC) { facts.connected = false
        return { facts, complete: true, message: `${named(d)}: it has no MAC address (a VPN device), so it has no WiFi signal.` } }
      const mac = d.MAC.toLowerCase(), number = v => Number.isFinite(parseFloat(v)) ? parseFloat(v) : null
      const station = stations => stations && typeof stations === 'object' ? Object.entries(stations).find(([m]) => m.toLowerCase() === mac)?.[1] : undefined
      const found = (where, iface, st, status) => {
        const rate = v => number(v) === null ? null : number(v) / 10, show = (v, unit) => v === null ? 'not returned' : `${v}${unit}`
        Object.assign(facts, { connected: true, accessPoint: where, interface: iface, signalDbm: number(st.signal), ssid: typeof status?.ssid === 'string' ? status.ssid : null,
          channel: number(status?.channel), frequencyMhz: number(status?.freq), txRateMbps: rate(st.tx_rate_info), rxRateMbps: rate(st.rx_rate_info), connectedSeconds: number(st.connected_time) })
        return { facts, complete: facts.signalDbm !== null && status !== null,
          message: `${named(d)}: WiFi signal (RSSI) ${show(facts.signalDbm, ' dBm')} on ${where}, ${iface}${facts.ssid ? ` (${facts.ssid})` : ''}; channel ${show(facts.channel, '')}, ${show(facts.frequencyMhz, ' MHz')}; link rate to device ${show(facts.txRateMbps, ' Mbps')}, from device ${show(facts.rxRateMbps, ' Mbps')}; connected for ${show(facts.connectedSeconds, ' s')}. Read from the access point just now.` }
      }
      const devs = (await load('network.wifi.capabilities'))?.interfaces
      need(devs && typeof devs === 'object', 'WiFi interface list unavailable')
      const aps = sorted(Object.values(devs).flatMap(phy => Object.entries(phy || {})
        .filter(([name, info]) => typeof info?.type === 'string' && info.type.includes('AP') && info.ssid !== 'spr-setup' && (name.includes('.ap') ? name.split('.').length <= 2 : !name.includes('.')))
        .map(([name]) => name)))
      for (const iface of aps) {
        let stations
        try { stations = await load('network.wifi.stations', { iface }) } catch { facts.accessPointsFailed.push(`this router ${iface}`); continue }
        facts.accessPointsChecked.push(`this router ${iface}`)
        const st = station(stations); if (!st) continue
        let status = null
        try { const raw = await load('network.wifi.status', { iface }); status = { ssid: raw?.['ssid[0]'], channel: raw?.channel, freq: raw?.freq } } catch { facts.accessPointsFailed.push(`this router ${iface}`) }
        return found('this router', iface, st, status)
      }
      const mesh = await load('network.mesh.stations')
      facts.meshAvailable = mesh?.available === true
      for (const leaf of list(mesh?.leaves) || []) {
        const node = `mesh node ${leaf.ip}`
        if (!leaf.reachable) { facts.meshNodesUnreachable.push(leaf.ip); continue }
        facts.meshNodesChecked.push(leaf.ip)
        for (const iface of list(leaf.failed) || []) facts.accessPointsFailed.push(`${node} ${iface}`)
        for (const ap of list(leaf.interfaces) || []) {
          facts.accessPointsChecked.push(`${node} ${ap.iface}`)
          const st = station(ap.stations); if (st) return found(node, ap.iface, st, ap)
        }
      }
      const offline = facts.meshNodesUnreachable.map(ip => `mesh node ${ip}`), unread = [...facts.accessPointsFailed, ...offline]
      if (!unread.length) facts.connected = false
      const meshNote = facts.meshAvailable ? '' : ' Mesh nodes could not be listed (no mesh plugin, or it did not answer).'
      const checked = facts.accessPointsChecked.length ? join(facts.accessPointsChecked) : 'no access point'
      const gaps = [offline.length ? `${join(offline)} ${offline.length > 1 ? 'are' : 'is'} offline or not answering` : '',
        facts.accessPointsFailed.length ? `${join(facts.accessPointsFailed)} could not be read` : ''].filter(Boolean).join(', and ')
      return { facts, complete: !unread.length, message: unread.length
        ? `${named(d)}: it is not connected to any access point that answered (checked: ${checked}). ${gaps[0].toUpperCase()}${gaps.slice(1)}, so it cannot be ruled out there.${meshNote}`
        : `${named(d)}: it is not connected to any WiFi access point right now (checked: ${checked}), so there is no signal to report. It may be wired or offline.${meshNote}` }
    } },
  { id: 'tasks.devices.matching', label: 'Count and list saved devices, optionally the members of one group, policy or tag',
    description: 'Count and name saved devices. With no input it covers every saved device; supply at most one of policy, group or tag to count the devices that carry it (for example policy wan for devices that carry the wan policy).',
    menus: ['Devices', 'Groups', 'Tags'], needs: ['devices.list'],
    schema: object({ policy: filterField('policy'), group: filterField('group'), tag: filterField('tag') }, []),
    answer: async (input, load) => {
      const chosen = listFilters.filter(k => input[k] !== undefined); need(chosen.length <= 1, 'Filter the devices by at most one of policy, group or tag')
      const all = list(await load('devices.list')); need(all, 'Device inventory unavailable')
      const field = chosen[0], key = { policy: 'Policies', group: 'Groups', tag: 'DeviceTags' }[field]
      const facts = { filter: field ? { field, value: input[field] } : null, unknownDevices: [] }, names = []
      for (const d of all) {
        if (!d || (!d.MAC && !d.WGPubKey)) continue
        if (!field) { names.push(named(d)); continue }
        const values = strings(d[key])
        if (values === null) facts.unknownDevices.push(named(d)); else if (values.includes(input[field]) || values.some(v => v.trim().toLowerCase() === input[field].trim().toLowerCase())) names.push(named(d))
      }
      facts.count = names.length; facts.names = sorted(names).slice(0, NAME_LIMIT); facts.namesTruncated = names.length > NAME_LIMIT
      facts.unknownDevices = sorted(facts.unknownDevices)
      const complete = !facts.unknownDevices.length
      let message = `${facts.count} saved device${facts.count === 1 ? '' : 's'}${field ? ` with ${field} ${input[field]}` : ''}: ${join(facts.names)}${facts.namesTruncated ? ` (first ${NAME_LIMIT} by name)` : ''}.`
      if (!complete) message += ` The ${field} list was not returned for: ${join(facts.unknownDevices.slice(0, NAME_LIMIT))}.`
      return { facts, complete, message }
    } },
  { id: 'tasks.family.schedule', label: 'Blocked hours (schedule) of one persona',
    description: 'Show the saved blocked days and times for one exact family persona and whether its controls are enabled.',
    menus: ['Devices', 'Family'], needs: ['devices.personas.read'],
    schema: object({ persona: string({ minLength: 1, maxLength: 256, description: 'Exact family persona name or tag.' }) }, ['persona']),
    answer: async ({ persona }, load) => {
      const data = await load('devices.personas.read'), people = list(data?.personas); need(people, 'Family profiles unavailable')
      const matches = matchRef(people, persona, ['Name', 'Tag']); need(matches.length === 1, matches.length ? `${matches.length} personas match "${persona.slice(0, NAME_LIMIT)}"; use the persona tag` : `No persona is named "${persona.slice(0, NAME_LIMIT)}". Existing personas: ${join(people.map(p => p.Name).filter(Boolean).slice(0, 20))}`)
      const p = matches[0], windows = list(p.Schedules)
      const facts = { persona: { name: p.Name, tag: p.Tag }, enabled: typeof p.Disabled === 'boolean' ? !p.Disabled : null }
      facts.windows = windows?.map(w => {
        need(Array.isArray(w.Days) && w.Days.length === 7 && w.Days.every(d => d === 0 || d === 1) && /^\d{1,2}:\d\d$/.test(w.Start) && /^\d{1,2}:\d\d$/.test(w.End), 'Schedule fields are incomplete')
        return { days: dayNames.filter((_, i) => w.Days[i] === 1), start: w.Start, end: w.End }
      }) ?? null
      let message = facts.windows === null ? `${p.Name}: schedules were not returned.`
        : `${p.Name} blocked hours: ${join(facts.windows.map(w => `${join(w.days)} ${w.start}–${w.end}`))} (router-local time).`
      if (facts.enabled === false) message += ' These family controls are disabled.'
      if (facts.enabled === null) message += ' Whether the controls are enabled is unknown.'
      return { facts, complete: facts.windows !== null && facts.enabled !== null, message }
    } },
  { id: 'tasks.traffic.totals', label: 'Recorded download and upload traffic totals',
    description: 'Show recorded bytes downloaded and uploaded over the last explicit number of minutes, for the whole network or one exact device. Totals come from hourly buckets and are not exact interval totals. Never invent the minutes.',
    menus: ['Traffic'], needs: ['network.traffic.inspect'],
    schema: object({ minutes: integer({ minimum: 1, maximum: 10080 }), device: deviceField }, ['minutes']),
    answer: async ({ minutes, device }, load) => {
      const observation = await load('network.traffic.inspect', { minutes, ...(device ? { device } : {}) }), data = observation.data
      const facts = { requestedMinutes: minutes, device: observation.device ? { identity: identity(observation.device), name: named(observation.device) } : null }
      const incoming = device ? data?.BytesIn : data?.TotalIn, outgoing = device ? data?.BytesOut : data?.TotalOut
      facts.bytesIn = typeof incoming === 'number' && Number.isFinite(incoming) && incoming >= 0 ? incoming : null
      facts.bytesOut = typeof outgoing === 'number' && Number.isFinite(outgoing) && outgoing >= 0 ? outgoing : null
      facts.aggregation = 'hourly'; facts.exactRequestedWindow = false
      return { facts, complete: facts.bytesIn !== null && facts.bytesOut !== null && observation.incomplete === false,
        message: `Recorded internet traffic for ${device || 'the network'}, requested last ${minutes} minutes: ${facts.bytesIn === null ? 'unknown download' : facts.bytesIn + ' bytes downloaded'}, ${facts.bytesOut === null ? 'unknown upload' : facts.bytesOut + ' bytes uploaded'}. Hourly buckets can include earlier activity; this is not an exact interval total.` }
    } },
  { id: 'tasks.plugins.status', label: 'Enabled and disabled plugins',
    description: 'List every plugin with its saved enabled or disabled setting. Enablement is configuration, not proof the plugin works.',
    menus: ['System > Plugins'], needs: ['system.plugins.read'], schema: noInput,
    answer: async (_, load) => {
      const plugins = list(await load('system.plugins.read')); need(plugins, 'Plugin inventory unavailable')
      const facts = { plugins: plugins.map(p => ({ name: p.Name, enabled: typeof p.Enabled === 'boolean' ? p.Enabled : null })).sort((a, b) => order(a.name, b.name)) }
      return { facts, complete: facts.plugins.every(p => p.enabled !== null),
        message: `Plugin settings: ${join(facts.plugins.map(p => `${p.name}: ${p.enabled === null ? 'unknown' : p.enabled ? 'enabled' : 'disabled'}`))}.` }
    } },
  { id: 'tasks.firewall.forwards', label: 'Saved port forwards (port forwarding rules)',
    description: 'List every saved port forward: protocol, external port, destination address and port. Read-only; to create a forward use tasks.firewall.port_forward.',
    menus: ['Firewall'], needs: ['firewall.config'], schema: noInput,
    answer: async (_, load) => {
      const config = await load('firewall.config'), rules = list(config?.ForwardingRules); need(rules, 'Port forwards unavailable')
      const text = v => typeof v === 'string' && v ? v : null
      const facts = { forwards: rules.map(r => ({ name: text(r.RuleName), protocol: text(r.Protocol), externalPort: text(r.SrcPort), allowedSource: text(r.SrcIP),
        destination: text(r.DstIP), destinationPort: text(r.DstPort), disabledFlag: typeof r.Disabled === 'boolean' ? r.Disabled : null })) }
      let message = `Saved port forwards: ${join(facts.forwards.map(f => `${f.destinationPort === 'any' ? `all ${f.protocol || 'unknown protocol'} ports to ${f.destination || 'unknown'}` : `${f.protocol || 'unknown protocol'} port ${f.externalPort || 'unknown'} to ${f.destination || 'unknown'}:${f.destinationPort || 'unknown'}`}${f.name ? ` (${f.name})` : ''}${f.disabledFlag ? ' [disabled flag set]' : ''}`))}.`
      if (facts.forwards.some(f => f.disabledFlag)) message += ' The saved disabled flag is recorded only; it does not show the forward is inactive.'
      return { facts, complete: facts.forwards.every(f => f.protocol && f.externalPort && f.destination && f.destinationPort), message }
    } },
  { id: 'tasks.vpn.peers', label: 'WireGuard VPN peers (clients) and their last handshake',
    description: 'List the WireGuard VPN peers with the matching saved device name, allowed address and last handshake time. A past handshake does not show a peer is connected now. Keys other than the public key are never shown.',
    menus: ['VPN'], needs: ['network.vpn.peers', 'devices.list'], schema: noInput,
    answer: async (_, load) => {
      const peers = list(await load('network.vpn.peers')); need(peers, 'WireGuard peers unavailable')
      const all = list(await load('devices.list')); need(all, 'Device inventory unavailable')
      const facts = { peers: peers.map(p => {
        need(typeof p.PublicKey === 'string' && p.PublicKey, 'WireGuard peer identity unavailable')
        const owner = all.filter(d => d.WGPubKey === p.PublicKey), seconds = p.LatestHandshake
        return { publicKey: p.PublicKey, device: owner.length === 1 ? named(owner[0]) : null,
          allowedIPs: typeof p.AllowedIPs === 'string' && p.AllowedIPs && p.AllowedIPs !== '(none)' ? p.AllowedIPs : null,
          lastHandshake: seconds === 0 ? 'never' : Number.isInteger(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null }
      }).sort((a, b) => order(a.publicKey, b.publicKey)) }
      return { facts, complete: facts.peers.every(p => p.lastHandshake !== null),
        message: `WireGuard peers: ${join(facts.peers.map(p => `${p.device || p.publicKey} (${p.allowedIPs || 'no allowed address'}; last handshake ${p.lastHandshake === null ? 'unknown' : p.lastHandshake})`))}. A past handshake does not show a peer is connected now.` }
    } },
  { id: 'tasks.uplinks.health', label: 'Internet uplink (WAN connection) health status',
    description: 'Show each WAN uplink interface with its measured health (online, recovering or offline, latency, loss). Health is only measured while WAN health monitoring is on; otherwise it is reported as unknown.',
    menus: ['Network > Internet Health'], needs: ['network.wan.config', 'network.wan.status'], schema: noInput,
    answer: async (_, load) => {
      const config = await load('network.wan.config'), rows = list(await load('network.wan.status')); need(rows, 'WAN status unavailable')
      const facts = { monitoringEnabled: typeof config?.Enabled === 'boolean' ? config.Enabled : null }
      const observed = facts.monitoringEnabled === true, number = v => observed && typeof v === 'number' && Number.isFinite(v) ? v : null
      facts.uplinks = rows.map(r => {
        need(typeof r.Iface === 'string' && r.Iface, 'Uplink interface unavailable')
        return { iface: r.Iface, up: observed && typeof r.Up === 'boolean' ? r.Up : null, active: typeof r.Active === 'boolean' ? r.Active : null, latencyMs: number(r.LatencyMs), lossPct: number(r.LossPct) }
      }).sort((a, b) => order(a.iface, b.iface))
      let message = `WAN uplinks: ${join(facts.uplinks.map(u => `${u.iface}: ${u.up === null ? 'health unknown' : !u.up ? 'offline' : u.active === false ? 'recovering' : 'online'}${u.latencyMs === null ? '' : `, latency ${u.latencyMs} ms`}${u.lossPct === null ? '' : `, loss ${u.lossPct}%`}`))}.`
      if (!observed) message += facts.monitoringEnabled === false ? ' WAN health monitoring is off, so uplink health is not measured.' : ' Whether WAN health monitoring is on is unknown.'
      return { facts, complete: observed && facts.uplinks.every(u => u.up !== null), message }
    } },
  { id: 'tasks.alerts.list', label: 'Saved alert rules',
    description: 'List every saved alert rule with whether it is enabled and whether it sends notifications. Read-only; to change alerts use tasks.alerts.create or tasks.alerts.modify.',
    menus: ['Monitor > Alerts'], needs: ['monitor.alerts.read'], schema: noInput,
    answer: async (_, load) => {
      const rows = list(await load('monitor.alerts.read')); need(rows, 'Alert rules unavailable')
      const facts = { alerts: rows.map((r, index) => ({ index, name: typeof r.Name === 'string' && r.Name ? r.Name : null, topic: typeof r.TopicPrefix === 'string' ? r.TopicPrefix : null,
        title: typeof r.Actions?.[0]?.MessageTitle === 'string' && r.Actions[0].MessageTitle ? r.Actions[0].MessageTitle : null,
        enabled: typeof r.Disabled === 'boolean' ? !r.Disabled : null, notifies: Array.isArray(r.Actions) ? r.Actions.some(a => a?.SendNotification === true) : null,
        stores: Array.isArray(r.Actions) ? r.Actions.some(a => a?.StoreAlert === true) : null })) }
      return { facts, complete: facts.alerts.every(a => a.enabled !== null && a.notifies !== null),
        message: `Alert rules: ${join(facts.alerts.map(a => `${a.title || a.name || 'unnamed rule ' + a.index}${a.title && a.name && a.title !== a.name ? ` [${a.name}]` : ''} (${a.enabled === null ? 'enablement unknown' : a.enabled ? 'enabled' : 'disabled'}${a.notifies === true ? ', sends notifications' : a.notifies === false ? (a.stores ? ', stores alerts without notifying' : ', no notification') : ''})`))}.` }
    } },
  { id: 'tasks.alerts.events', label: 'Show the alert events: alerts that fired or were triggered',
    description: 'Show the alert events that were raised: reads the latest page of every alert bucket and reports counts per topic and the most recent events. Needs no bucket or other input. For the saved alert rules use tasks.alerts.list.',
    menus: ['Monitor > Alerts', 'Monitor > Events'], needs: ['monitor.events.buckets', 'monitor.events.query', 'devices.list'], schema: noInput,
    answer: async (_, load) => {
      const PAGE = 20, SHOWN = 10, prefix = 'alert:'
      const all = list((await load('monitor.events.buckets'))?.buckets); need(all, 'Event buckets unavailable')
      const buckets = sorted(all.filter(b => typeof b === 'string' && b.startsWith(prefix)))
      let devices = []
      try { devices = list(await load('devices.list')) || [] } catch { devices = [] }
      const facts = { bucketsChecked: [], bucketsFailed: [], topics: [], events: [] }, events = []
      await Promise.all(buckets.map(async bucket => {
        let page
        try { page = await load('monitor.events.query', { bucket, num: PAGE }) } catch { facts.bucketsFailed.push(bucket); return }
        const rows = list(page?.rows) || []
        facts.bucketsChecked.push(bucket)
        const topic = bucket.slice(prefix.length)
        const state = r => String(r?.State || '').trim().toLowerCase() === 'resolved' ? 'Resolved' : 'New'
        if (rows.length) facts.topics.push({ topic, events: rows.length, open: rows.filter(r => state(r) !== 'Resolved').length, mayHaveMore: page.mayHaveMore === true })
        for (const r of rows) events.push({ time: typeof r?.time === 'string' ? r.time : null, topic, state: state(r),
          title: [fillAlertTemplate(r?.Title, r?.Event, devices), fillAlertTemplate(r?.Body, r?.Event, devices)].filter(Boolean).join(': ').slice(0, 200) || null,
          item: { ...r, AlertTopic: bucket, State: state(r) } })
      }))
      facts.bucketsChecked.sort(order); facts.bucketsFailed.sort(order); facts.topics.sort((a, b) => order(a.topic, b.topic))
      events.sort((a, b) => order(b.time || '', a.time || '') || order(a.topic, b.topic))
      facts.alertItems = events.slice(0, SHOWN).map(e => e.item)
      facts.events = events.slice(0, SHOWN).map(({ item, ...rest }) => rest); facts.eventsRead = events.length
      const complete = !facts.bucketsFailed.length, more = facts.topics.some(t => t.mayHaveMore)
      facts.view = 'alerts'
      const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
      let message = !buckets.length ? 'There are no alert buckets, so no alert events are stored.'
        : !events.length ? `No alert events are stored in the ${plural(facts.bucketsChecked.length, 'alert topic')} that were read.`
        : `${plural(events.length, 'alert event')} read from ${plural(facts.bucketsChecked.length, 'alert topic')}, latest ${PAGE} per topic: ${facts.topics.map(t => `${t.topic.replace(/:+$/, '')} ${t.events}${t.mayHaveMore ? '+' : ''} (${t.open} new)`).join(', ')}.${more ? ' A + means that topic has more.' : ''}`
      if (!complete) message += ` Could not read: ${join(facts.bucketsFailed)}.`
      facts.viewNote = complete ? '' : `The Assistant could not read: ${join(facts.bucketsFailed)}.`
      return { facts, complete, message }
    } }
]

export const STATUS_TASK_IDS = TASKS.map(t => t.id)

export const createStatusTasks = operations => {
  const byID = new Map(operations.map(s => [s.id, s]))
  const read = async (id, input, context) => {
    const op = byID.get(id)
    need(op?.kind === 'read', 'Status source unavailable')
    validateInput(input, op.schema)
    return op.run(input, context)
  }
  return TASKS.filter(t => t.needs.every(id => byID.has(id))).map(t => ({ id: t.id, domain: 'tasks', kind: 'read', task: true, terminalResponse: true,
    label: t.label, description: `${t.description} Read-only: the answer is generated by code from current router data, and missing data stays unknown.`,
    menus: [...t.menus, 'AI Assistant'], schema: t.schema,
    sources: ['frontend/src/components/Assistant/statusTasks.js', ...t.needs.flatMap(id => byID.get(id).sources || [])],
    run: async (input, context) => {
      validateInput(input, t.schema)
      const origin = getApiURL(), sources = []
      const load = async (id, args = {}) => { const v = await read(id, args, context); sources.push({ operation: id, input: args }); return v }
      const { facts, message, complete } = await t.answer(input, load)
      need(origin === getApiURL(), 'The selected router changed; request fresh information')
      return { facts, sources, message, receipt: taskReceipt(complete ? 'observed' : 'incomplete', 'Read current router settings.',
        { operationId: t.id, applied: false, answerSource: 'verified_status_renderer_v2' }) }
    } }))
}
