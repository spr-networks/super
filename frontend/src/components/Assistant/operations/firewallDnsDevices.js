import { firewallAPI, allowlistAPI, geoBlockAPI, wifiAPI, blockAPI, logAPI, dbAPI, parentalAPI, classifyAPI, pfwAPI } from 'api'
import { deviceAPI } from '../assistantDeviceApi'
import { CoreDNS } from 'api/CoreDNS'
import { dyndnsAPI } from 'api/Dyndns'
import { Multicast } from 'api/Multicast'
import { Address4, Address6 } from 'ip-address'
import { object, string, integer, number, boolean, array, enumValue } from '../operationSchema'

const s = () => string({ maxLength: 2048 })
const strings = () => array(s(), { maxItems: 256, uniqueItems: true })
const empty = () => object({})
const clone = (value) => JSON.parse(JSON.stringify(value))
const stable = (value) => JSON.stringify(value, (_, v) =>
  v && !Array.isArray(v) && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v)
const same = (left, right) => stable(left) === stable(right)
const pick = (value, keys) => Object.fromEntries(keys.filter((key) => value?.[key] !== undefined).map((key) => [key, value[key]]))
const unique = (values) => [...new Set(values)]
const required = (condition, message) => { if (!condition) throw new Error(message) }
const one = (items, predicate, label) => {
  const matches = (items || []).filter(predicate)
  required(matches.length === 1, `Expected one exact ${label}; found ${matches.length}. Refresh or clarify the identity.`)
  return clone(matches[0])
}
const ipv4 = (value) => typeof value === 'string' && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value) && value.split('.').every((n) => String(Number(n)) === n && Number(n) <= 255)
const normalizeHost = (value) => {
  let name = value.trim().toLowerCase().replace(/\.$/, '')
  if (name && !name.includes('.')) name += '.lan'
  required(name.length <= 253 && name.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)), 'Invalid hostname')
  required(name !== 'spr.lan' && !name.endsWith('.spr.lan'), 'This hostname is reserved for SPR')
  return name
}
const domainName = (value) => {
  const trimmed = value.trim()
  required(trimmed && !/[\s/]/.test(trimmed), 'Expected one DNS name')
  return trimmed.endsWith('.') ? trimmed : `${trimmed}.`
}
const pathSegment = (value) => { required(value && !/[\\/?#]/.test(value) && value !== '.' && value !== '..', 'Unsupported name in an API path'); return value }
const fieldsMatch = (actual, expected) => actual != null && Object.keys(expected).every((key) => same(actual[key], expected[key]))
const verified = (ok, data, summary = 'Configuration read back; this does not test end-to-end connectivity.') => ({ verified: ok, summary, data })
const meta = (id, label, description, menus, sources) => ({ id, domain: id.split('.')[0], label, description, menus, sources })
const read = (id, label, description, menus, sources, schema, run) => ({ ...meta(id, label, description, menus, sources), kind: 'read', schema, run })
const patchWrite = ({ id, label, description, menus, sources, fields, get, put, validate = () => {}, redact }) => {
  const project = (input, before) => {
    required(Object.keys(input.changes).length > 0, 'At least one changed field is required')
    const after = { ...clone(before), ...clone(input.changes) }
    validate(input, before, after)
    return after
  }
  return { ...meta(id, label, description, menus, sources), kind: 'write',
    schema: object({ changes: object(fields) }, ['changes']), snapshot: get, project, redact,
    run: (input, context) => put(project(input, context.before)),
    verify: async (input, before) => {
      const after = await get(input)
      return verified(fieldsMatch(after, project(input, before)), redact ? redact(after) : after)
    } }
}
const FW = ['Firewall > Firewall', 'Firewall > Services']
const DNS_SETTINGS = ['DNS > DNS Settings']
const BLOCK = ['DNS > Blocklists/Ad-Block', 'DNS > DNS Log']
const HOSTS = ['DNS > Hostnames']
const DEVICES = ['Devices', 'AI Assistant']
const src = (name) => `frontend/src/${name}`
const DEVICE_KEYS = ['Name', 'MAC', 'WGPubKey', 'RecentIP', 'VLANTag', 'Policies', 'Groups', 'DeviceTags']
export const deviceAuthType = (device) => {
  const type = device?.PSKEntry?.Type
  return typeof type === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(type) ? { WiFiAuthType: type.toLowerCase() } : {}
}
const safeDevice = (device) => ({ ...pick(device, DEVICE_KEYS), ...deviceAuthType(device) })
const devices = async () => Object.values(await deviceAPI.list()).map(safeDevice)
const deviceMatches = (device, identity) => Boolean((device.MAC && device.MAC.toLowerCase() === identity.toLowerCase()) || (device.WGPubKey && device.WGPubKey === identity))
const exactDevice = async ({ identity }) => {
  required(identity.length > 0, 'An exact nonempty device identity is required')
  return one(await devices(), (device) => deviceMatches(device, identity), 'device')
}
const deviceIdentity = () => string({ maxLength: 2048, description: 'Exact MAC or WGPubKey value from devices.list. Copy it unchanged; do not use a device name or invent a name/IP prefix.' })
const deviceFields = { Name: s(), RecentIP: s(),
  VLANTag: { ...s(), description: 'VLAN tag string. Use "0" to clear the saved tag; an empty string is ignored by the backend.' },
  Policies: strings(), Groups: strings(), DeviceTags: strings() }
const deviceProject = (input, before) => {
  required(Object.keys(input.changes).length > 0, 'Device changes are empty')
  if (input.changes.Name !== undefined) required(input.changes.Name.length > 0, 'An empty device name is not saved by the backend; choose a nonempty name')
  if (input.changes.VLANTag !== undefined) required(input.changes.VLANTag.length > 0, 'Use VLANTag "0" to clear the saved tag; an empty string is not saved')
  if (input.changes.RecentIP !== undefined) required(ipv4(input.changes.RecentIP), 'RecentIP must be an IPv4 address')
  const after = { ...before, ...clone(input.changes) }
  if (input.changes.VLANTag === '0') after.VLANTag = ''
  return after
}
const rebindingProtection = async () => {
  const config = await blockAPI.config()
  required(typeof config?.RebindingCheckDisable === 'boolean', 'DNS rebinding state unavailable: expected boolean RebindingCheckDisable; refresh before changing protection')
  return { DisableRebinding: config.RebindingCheckDisable }
}

const personaFields = {
  Description: s(), DailyLimitMinutes: integer({ minimum: 0, maximum: 1440 }),
  Schedules: array(object({
    Days: array(enumValue([0, 1]), { minItems: 7, maxItems: 7 }),
    Start: string({ pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' }),
    End: string({ pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' })
  }, ['Days', 'Start', 'End']), { maxItems: 32 }),
  DNSFamily: boolean(), Disabled: boolean()
}
const personaSnapshot = async ({ Tag }) => {
  const all = await parentalAPI.personas()
  required(Array.isArray(all), 'Persona inventory unavailable')
  const persona = one(all, p => p.Tag === Tag, 'persona tag')
  required(typeof persona.Name === 'string' && persona.Name.length > 0 && all.filter(p => p.Name === persona.Name).length === 1,
    'Persona name is missing or ambiguous; the backend saves by name')
  required(Object.keys(personaFields).every(key => Object.prototype.hasOwnProperty.call(persona, key)), 'Incomplete persona; cannot preserve its settings')
  required(persona.Schedules === null || Array.isArray(persona.Schedules), 'Persona schedules unavailable')
  return persona
}
const personaProject = (input, before) => {
  required(Object.keys(input.changes).length > 0, 'Persona changes are empty')
  return { ...clone(before), ...clone(input.changes) }
}

const operations = [
  read('devices.list', 'Read device identities and access', 'Read exact MAC/WireGuard identities, names, addresses, policy/group/tag arrays and the WiFiAuthType of each device (sae = WPA3, or wpa2). Passphrases are omitted.', DEVICES, [src('api/Device.js')], empty(), devices),
  { ...meta('devices.update', 'Rename or update one device', 'Rename a device with a Name-only change, or change other explicitly supplied fields on an exact identity; arrays replace their field, so preserve unrelated members.', DEVICES, [src('api/Device.js')]),
    kind: 'write', schema: object({ identity: deviceIdentity(), changes: object(deviceFields) }, ['identity', 'changes']),
    snapshot: exactDevice, project: deviceProject,
    run: (input, context) => { deviceProject(input, context.before); return deviceAPI.update(input.identity, clone(input.changes)) },
    verify: async (input, before) => { const after = await exactDevice(input); return verified(fieldsMatch(after, deviceProject(input, before)), after) } },
  { ...meta('devices.bulk_policies', 'Change policies for selected devices', 'Add/remove policy members per exact selected identity, preserving each device’s other policies, groups and tags. Partial failures are reported individually.', ['Devices'], [src('api/Device.js'), src('views/Devices/DevicesBulkEdit.js')]),
    kind: 'write', schema: object({ identities: { ...strings(), items: deviceIdentity() }, add: strings(), remove: strings() }, ['identities', 'add', 'remove']),
    snapshot: async (input) => {
      required(input.identities.length > 0, 'Select at least one exact identity')
      const all = await devices()
      const selected = input.identities.map((id) => one(all, (device) => deviceMatches(device, id), 'device'))
      required(unique(selected.map((d) => d.MAC ? d.MAC.toLowerCase() : d.WGPubKey)).length === selected.length, 'The same device identity was selected more than once')
      return selected
    },
    project: (input, before) => {
      required(!input.add.some((value) => input.remove.includes(value)), 'A policy cannot be both added and removed')
      return before.map((device) => ({ ...device, Policies: unique([...(device.Policies || []).filter((p) => !input.remove.includes(p)), ...input.add]) }))
    },
    run: async (input, context) => {
      const spec = operations.find((op) => op.id === 'devices.bulk_policies')
      const after = spec.project(input, context.before)
      const results = []
      for (let index = 0; index < input.identities.length; index++) {
        const identity = input.identities[index]
        try { await deviceAPI.update(identity, { Policies: after[index].Policies }); results.push({ identity, applied: true }) }
        catch (error) { results.push({ identity, applied: false, error: String(error.message || error) }) }
      }
      return { results }
    },
    verify: async (input, before, result) => {
      const spec = operations.find((op) => op.id === 'devices.bulk_policies')
      const after = await spec.snapshot(input)
      return verified(result.results.every((r) => r.applied) && same(after, spec.project(input, before)), after)
    } },
  read('devices.personas.read', 'Read personas and usage', 'Read persona membership tags, schedules, limits and current pause/usage evidence.', ['Devices'], [src('api/ParentalControls.js')], empty(), async () => ({ personas: await parentalAPI.personas(), usage: await parentalAPI.usage() })),
  { ...meta('devices.personas.update', 'Update an existing family persona', 'Patch an exact existing persona tag, preserving its name, membership, other settings and schedules. Schedules are BLOCKED windows in router local time; Sunday is Days[0]. Zero daily minutes removes the daily cap, not Internet access.', ['Devices'], [src('api/ParentalControls.js'), 'api/code/parentalcontrols.go']),
    kind: 'write', schema: object({ Tag: s(), changes: object(personaFields) }, ['Tag', 'changes']),
    snapshot: personaSnapshot, project: personaProject,
    run: (input, context) => parentalAPI.savePersona(personaProject(input, context.before)),
    verify: async (input, before) => {
      const after = await personaSnapshot(input)
      return verified(same(after, personaProject(input, before)), after, 'Family settings read back. Limits count active WAN minutes across the persona and reset at 06:00 router time. Temporary grants can still override blocking; this is not a live connectivity test.')
    } },
  { ...meta('devices.personas.pause', 'Pause a persona temporarily', 'Pause the exact existing persona tag for a positive number of minutes. Retains daily limits, schedules and device membership.', ['Devices'], [src('api/ParentalControls.js')]),
    kind: 'write', schema: object({ Tag: s(), Minutes: integer({ minimum: 1, maximum: 10080 }) }, ['Tag', 'Minutes']),
    snapshot: async (input) => one(await parentalAPI.personas(), (p) => p.Tag === input.Tag, 'persona tag'),
    project: (input, before) => ({ persona: before, action: 'pause', ...input }),
    run: (input) => parentalAPI.pause(input.Tag, input.Minutes),
    verify: async () => ({ verified: null, summary: 'Pause request completed. Usage is read back; elapsed time and backend scheduling determine current Blocked state.', data: await parentalAPI.usage() }) },
  read('devices.classification.rules', 'Read custom classification rules', 'Read existing rules before adding a new fingerprint. Classifications are suggestions, not authorization for network access.', ['Devices'], [src('api/Classify.js')], empty(), () => classifyAPI.customFingerprints()),
  { ...meta('devices.classification.add_rule', 'Add a custom classification rule', 'Append one reviewed rule while preserving existing rules. Saving re-scores devices; it does not accept suggested network permissions.', ['Devices'], [src('api/Classify.js'), src('views/Devices/Classification.js')]),
    kind: 'write', schema: object({ rule: object({ SignalType: enumValue(['hostname', 'oui', 'mac_vendor', 'mdns_service', 'mdns_txt', 'ssdp', 'dns', 'vendor_class', 'dhcp_params']), Pattern: string({ minLength: 1, maxLength: 512 }), Vendor: s(), Category: s(), Weight: integer({ minimum: 1, maximum: 100 }) }, ['SignalType', 'Pattern', 'Category', 'Weight']) }, ['rule']),
    snapshot: () => classifyAPI.customFingerprints(), project: (input, before) => [...before, clone(input.rule)],
    run: (input, context) => classifyAPI.setCustomFingerprints([...context.before, clone(input.rule)]),
    verify: async (input, before) => {
      const after = await classifyAPI.customFingerprints()
      const created = { Vendor: '', Model: '', Decisive: false, ...input.rule }
      return verified(same(after, [...before, created]), after)
    } },
  { ...meta('devices.onboarding', 'Open protected device onboarding', 'Enter or generate a new device credential in the Add Device/Connect Device UI. Never disclose another device’s password in chat.', ['Devices'], [src('views/Devices/AddDevice.js'), src('views/Devices/ConnectDevice.js')]),
    kind: 'ui', route: '/admin/devices', instructions: 'Open Add Device for the explicitly selected new identity, then Connect Device. Generate or enter its credential only in those protected controls; never copy another device password into chat.', schema: object({ Name: s(), MAC: s() }, ['Name', 'MAC']),
    run: (input) => ({ route: '/admin/devices', instructions: `Open Add Device for ${input.Name} (${input.MAC}), then Connect Device. Create/view the new credential only in those protected controls.` }) },
  read('firewall.config', 'Read complete firewall settings', 'Read traffic rules, custom interfaces, service ports, ping settings, multicast and SystemDNSOverride. This includes settings omitted by the legacy get_firewall_config tool.', FW, [src('api/Firewall.js')], empty(), () => firewallAPI.config()),
  read('firewall.policy_evidence', 'Inspect allowlist and geoblock evidence', 'Read policy configuration, loaded-list status and IPv4 destination ASN/country evidence. Classification is not proof that a policy matched a packet.', ['Firewall > Firewall'], [src('api/Allowlist.js'), src('api/GeoBlock.js'), src('api/Wifi.js')], object({ destinationIP: s() }, ['destinationIP']), async (input) => { required(ipv4(input.destinationIP), 'Destination must be an IPv4 address'); return { allowlist: { config: await allowlistAPI.config(), status: await allowlistAPI.status() }, geoblock: { config: await geoBlockAPI.config(), status: await geoBlockAPI.status() }, destination: await wifiAPI.asn(input.destinationIP) } }),
  read('firewall.multicast.read', 'Read multicast proxy and firewall settings', 'Proxy settings and UDP admission are separate configurations; inspect both before changing mDNS behavior.', FW, [src('api/Multicast.js'), src('api/Firewall.js')], empty(), async () => ({ proxy: await Multicast.config(), ports: (await firewallAPI.config()).MulticastPorts || [] })),
  patchWrite({ id: 'firewall.icmp.update', label: 'Set router ping permissions', description: 'Set LAN/WAN ping independently. Ping success or failure does not establish TCP application health.', menus: ['Firewall > Services'], sources: [src('api/Firewall.js'), src('components/Firewall/ICMP.js')], fields: { PingLan: boolean(), PingWan: boolean() }, get: async () => pick(await firewallAPI.config(), ['PingLan', 'PingWan']), put: (data) => firewallAPI.setICMP(data) }),
  { ...meta('firewall.multicast.port', 'Set one multicast admission port', 'Keep the local multicast port and explicitly control whether it is admitted from upstream interfaces. Does not grant unicast application access.', FW, [src('api/Firewall.js')]),
    kind: 'write', schema: object({ Port: string({ pattern: '^\\d{1,5}$' }), Upstream: boolean() }, ['Port', 'Upstream']),
    snapshot: async () => (await firewallAPI.config()).MulticastPorts || [],
    project: (input, before) => { required(Number(input.Port) >= 1 && Number(input.Port) <= 65535, 'Invalid multicast port'); return [...before.filter((p) => p.Port !== input.Port), clone(input)] },
    run: (input) => firewallAPI.addMulticastPort(input),
    verify: async (input, before) => { const after = (await firewallAPI.config()).MulticastPorts || []; return verified(after.some((p) => fieldsMatch(p, input)) && before.filter((p) => p.Port !== input.Port).every((p) => after.some((entry) => same(entry, p))), after) } },
  read('firewall.tls.read', 'Read HTTPS status', 'The Services API exposes enableTLS only; no supported disable-TLS operation exists on this surface.', ['Firewall > Services'], [src('api/Firewall.js'), src('components/Firewall/UpstreamServicesList.js')], empty(), () => firewallAPI.getTLS()),
  read('dns.block.read', 'Read DNS filtering and overrides', 'Read lists, refresh interval, rebinding protection and scoped overrides. A failed read is not an empty configuration.', BLOCK, [src('api/DNS.js')], empty(), () => blockAPI.config()),
  read('dns.hostnames.read', 'Read local DNS hostnames', 'Read exact local hostname/address records and pinned state before editing.', HOSTS, [src('api/CoreDNS.js')], empty(), () => CoreDNS.hostnames()),
  read('dns.log.settings', 'Read DNS logging coverage', 'Read logging configuration, host privacy exclusions and ignored domains before interpreting an empty query search.', ['DNS > DNS Log'], [src('api/DNS.js')], empty(), async () => ({ config: await logAPI.config(), hostPrivacyList: await logAPI.hostPrivacyList(), domainIgnores: await logAPI.domainIgnores() })),
  read('dns.settings.read', 'Read DNS resolver configuration', 'Read primary/family provider settings, DNS rebinding protection and the separate router-host SystemDNSOverride.', DNS_SETTINGS, [src('api/CoreDNS.js'), src('api/DNS.js'), src('api/Firewall.js')], empty(), async () => ({ providers: await CoreDNS.config(), protection: await rebindingProtection(), system: pick(await firewallAPI.config(), ['SystemDNSOverride']) }))
]

const replaceRule = async (remove, add, before, after) => {
  await remove(before)
  try { return await add(after) }
  catch (error) {
    try { await add(before) }
    catch (rollback) { throw new Error(`Replacement failed: ${error.message || error}; restoring the original also failed: ${rollback.message || rollback}`) }
    throw new Error(`Replacement failed; original rule restore request completed. Read back before retrying: ${error.message || error}`)
  }
}

const trafficText = () => string({ maxLength: 256 })
const trafficPort = () => string({ maxLength: 32, description: 'Explicit port, inclusive start-end range, or any. Never infer any from an omitted port.' })
const trafficCommon = { RuleName: trafficText(), Description: trafficText(), Protocol: enumValue(['tcp', 'udp']) }
const trafficAddress = (value, field, cidr = true) => {
  required(typeof value === 'string' && value && value === value.trim() && (cidr || !value.includes('/')), `${field} must be an explicit ${cidr ? 'IP address or CIDR' : 'IP address'}`)
  try { value.includes(':') ? new Address6(value) : new Address4(value) }
  catch { throw new Error(`${field} must be a valid IP address${cidr ? ' or CIDR' : ''}`) }
}
const checkTrafficPort = (port, field) => {
  if (port === 'any' || port === '0-65535') return
  required(typeof port === 'string' && /^\d{1,5}(?:-\d{1,5})?$/.test(port), `${field} must be an explicit port, range or any`)
  const [start, end = start] = port.split('-').map(Number)
  required(start >= 1 && end <= 65535 && start <= end, `${field} is outside the valid port range`)
}
const classicRules = {
  endpoint: { key: 'Endpoints', add: 'addEndpoint', remove: 'deleteEndpoint', view: 'AddEndpoint', label: 'tag-scoped service endpoint', scope: 'Allows the IP endpoint to devices carrying at least one of its Tags; empty Tags match no devices. Domain-only endpoints are not supported because firewall enforcement uses IP. It does not assign device tags.',
    fields: { ...trafficCommon, IP: trafficText(), Port: trafficPort(), Tags: strings() }, required: ['RuleName', 'Protocol', 'IP', 'Port', 'Tags'], identity: ['RuleName'] },
  port_forward: { key: 'ForwardingRules', add: 'addForward', remove: 'deleteForward', view: 'AddForward', label: 'port forwarding rule', scope: 'DNAT to the exact internal DstIP/DstPort; SrcIP restricts incoming source addresses and SrcPort is the external destination port.',
    fields: { ...trafficCommon, SrcIP: trafficText(), SrcPort: trafficPort(), DstIP: trafficText(), DstPort: trafficPort() }, required: ['Protocol', 'SrcIP', 'SrcPort', 'DstIP', 'DstPort'], identity: ['Protocol', 'SrcIP', 'SrcPort', 'DstIP', 'DstPort'] },
  inbound_block: { key: 'BlockRules', add: 'addBlock', remove: 'deleteBlock', view: 'AddBlock', label: 'router inbound block rule', scope: 'Blocks traffic terminating on SPR for the exact source/destination addresses and protocol; it does not block forwarded client traffic.',
    fields: { ...trafficCommon, SrcIP: trafficText(), DstIP: trafficText() }, required: ['Protocol', 'SrcIP', 'DstIP'], identity: ['Protocol', 'SrcIP', 'DstIP'] },
  forward_block: { key: 'ForwardingBlockRules', add: 'addForwardBlock', remove: 'deleteForwardBlock', view: 'AddForwardBlock', label: 'forwarded traffic block rule', scope: 'Blocks forwarded traffic by source, destination, protocol and destination port; it does not block router-originated traffic.',
    fields: { ...trafficCommon, SrcIP: trafficText(), DstIP: trafficText(), DstPort: trafficPort() }, required: ['Protocol', 'SrcIP', 'DstIP', 'DstPort'], identity: ['Protocol', 'SrcIP', 'DstIP', 'DstPort'] },
  outbound_block: { key: 'OutputBlockRules', add: 'addOutputBLock', remove: 'deleteOutputBlock', view: 'AddOutputBlock', label: 'router outbound block rule', scope: 'Blocks traffic originating on SPR by source/destination addresses and protocol, across all ports. The backend ignores DstPort on this rule type; it does not block forwarded clients.',
    fields: { ...trafficCommon, SrcIP: trafficText(), DstIP: trafficText() }, required: ['Protocol', 'SrcIP', 'DstIP'], identity: ['Protocol', 'SrcIP', 'DstIP'] }
}
for (const [type, spec] of Object.entries(classicRules)) {
  const sources = [src('api/Firewall.js'), src(`components/Firewall/${spec.view}.js`), 'api/code/firewall.go']
  const selectorFields = { ...spec.fields, ...(type === 'endpoint' ? { Domain: trafficText() } : {}), Disabled: boolean(), ...(type === 'outbound_block' ? { DstPort: trafficText() } : {}) }
  const normalize = (rule) => ({
    ...Object.fromEntries(Object.keys(selectorFields).map((key) => [key, key === 'Disabled' ? false : key === 'Tags' ? [] : ''])),
    ...clone(rule), ...(type === 'endpoint' ? { Tags: rule.Tags || [], Port: rule.Port === 'any' ? '0-65535' : rule.Port } : {})
  })
  const list = async () => {
    const config = await firewallAPI.config()
    required(config && Object.prototype.hasOwnProperty.call(config, spec.key) && (config[spec.key] === null || Array.isArray(config[spec.key])), `Missing ${spec.key} evidence; refresh firewall settings`)
    return clone(config[spec.key] || [])
  }
  const existing = (input, before) => {
    required(Object.keys(input.previousRule).length > 0, 'An observed rule selector is required')
    const selected = one(before, (rule) => fieldsMatch(rule, input.previousRule), spec.label)
    if (type === 'endpoint') required(before.filter((rule) => rule.RuleName === selected.RuleName).length === 1, 'Endpoint RuleName is not unique')
    return selected
  }
  const validate = (rule) => {
    required(['tcp', 'udp'].includes(rule.Protocol), 'Protocol must be tcp or udp')
    if (type === 'endpoint') {
      required(rule.RuleName?.trim(), 'Endpoint RuleName is required')
      required(Boolean(rule.IP) && !rule.Domain, 'Endpoint enforcement requires IP; domain-only endpoints are unsupported')
      trafficAddress(rule.IP, 'IP')
      required(Array.isArray(rule.Tags) && rule.Tags.every((tag) => tag.trim().length > 0), 'Tags must contain nonempty tags; an empty array matches no devices')
    } else {
      trafficAddress(rule.SrcIP, 'SrcIP')
      trafficAddress(rule.DstIP, 'DstIP', type !== 'port_forward')
    }
    for (const key of ['Port', 'SrcPort', 'DstPort']) if (spec.fields[key]) checkTrafficPort(rule[key], key)
    return rule
  }
  const project = (action, input, before) => {
    const selected = action === 'add' ? null : existing(input, before)
    const rest = selected ? before.filter((rule) => !same(rule, selected)) : before
    if (action === 'delete') return rest
    if (action === 'update') required(Object.keys(input.changes).length > 0, 'At least one changed field is required')
    const after = validate(action === 'add' ? clone(input.rule) : { ...selected, ...clone(input.changes) })
    required(!rest.some((rule) => spec.identity.every((key) => same(normalize(rule)[key], normalize(after)[key]))), 'A matching rule already exists; review that exact rule instead')
    return [...rest, after]
  }
  const collection = (rules) => rules.map((rule) => stable(normalize(rule))).sort()
  for (const action of ['add', 'update', 'delete']) {
    const schema = action === 'add' ? object({ rule: object(spec.fields, spec.required) }, ['rule'])
      : object({ previousRule: object(selectorFields), ...(action === 'update' ? { changes: object(spec.fields) } : {}) }, action === 'update' ? ['previousRule', 'changes'] : ['previousRule'])
    operations.push({ ...meta(`firewall.${type}.${action}`, `${action === 'add' ? 'Add' : action === 'update' ? 'Update' : 'Delete'} one ${spec.label}`,
      `${spec.scope} ${action === 'add' ? 'Create a new rule only.' : 'Select one exact observed rule; patches preserve all other fields.'} Classic Disabled flags are not enforced by this backend; use deletion to remove a rule.`, ['Firewall > Firewall'], sources),
      kind: 'write', schema, snapshot: list, project: (input, before) => project(action, input, before),
      run: async (input, context) => {
        const expected = project(action, input, context.before)
        if (action === 'add') return firewallAPI[spec.add](clone(input.rule))
        const selected = existing(input, context.before)
        if (action === 'delete') return firewallAPI[spec.remove](selected)
        const after = expected[expected.length - 1]
        if (type === 'endpoint' && selected.RuleName === after.RuleName) return firewallAPI[spec.add](after)
        return replaceRule((rule) => firewallAPI[spec.remove](rule), (rule) => firewallAPI[spec.add](rule), selected, after)
      },
      verify: async (input, before) => {
        const after = await list()
        return verified(same(collection(after), collection(project(action, input, before))), after)
      } })
  }
}
const serviceSchema = object({ Protocol: enumValue(['tcp', 'udp']), Port: string({ pattern: '^\\d{1,5}$' }), UpstreamEnabled: boolean(), Description: s() }, ['Protocol', 'Port', 'UpstreamEnabled'])
const serviceSource = [src('api/Firewall.js'), src('components/Firewall/AddServicePort.js')]
const serviceList = async () => (await firewallAPI.config()).ServicePorts || []
operations.push(
  { ...meta('firewall.service.add', 'Add a router service port', 'Admit a service terminating on SPR. UpstreamEnabled false preserves LAN-only exposure; this is not DNAT.', ['Firewall > Services'], serviceSource), kind: 'write', schema: object({ rule: serviceSchema }, ['rule']),
    snapshot: serviceList,
    project: (input, before) => { required(Number(input.rule.Port) >= 1 && Number(input.rule.Port) <= 65535, 'Invalid service port'); required(!before.some((r) => r.Protocol === input.rule.Protocol && r.Port === input.rule.Port), 'Service already exists; update the exact rule instead'); return [...before, input.rule] },
    run: (input) => firewallAPI.addServicePort(clone(input.rule)),
    verify: async (input) => { const after = await serviceList(); return verified(after.some((r) => fieldsMatch(r, input.rule)), after) } },
  { ...meta('firewall.service.update', 'Replace one router service port', 'Replace an exact service rule with a reviewed field patch. Attempts original-rule restoration if add fails; read back per-operation results.', ['Firewall > Services'], serviceSource), kind: 'write',
    schema: object({ Protocol: enumValue(['tcp', 'udp']), Port: s(), changes: object(serviceSchema.properties) }, ['Protocol', 'Port', 'changes']),
    snapshot: serviceList,
    project: (input, before) => {
      required(Object.keys(input.changes).length > 0, 'At least one changed field is required')
      const selected = one(before, (r) => r.Protocol === input.Protocol && r.Port === input.Port, 'service rule')
      const after = { ...selected, ...input.changes }
      required(Number(after.Port) >= 1 && Number(after.Port) <= 65535, 'Invalid service port')
      const rest = before.filter((r) => !same(r, selected))
      required(!rest.some((r) => r.Protocol === after.Protocol && r.Port === after.Port), 'Target service already exists; preserve that rule and clarify the intended change')
      return [...rest, after]
    },
    run: (input, context) => {
      const expected = operations.find((op) => op.id === 'firewall.service.update').project(input, context.before)
      const selected = one(context.before, (r) => r.Protocol === input.Protocol && r.Port === input.Port, 'service rule')
      return replaceRule((r) => firewallAPI.deleteServicePort(r), (r) => firewallAPI.addServicePort(r), selected, expected[expected.length - 1])
    },
    verify: async (input, before) => {
      const rules = await serviceList(), expected = operations.find((op) => op.id === 'firewall.service.update').project(input, before)
      return verified(rules.length === expected.length && expected.every((r) => rules.some((entry) => fieldsMatch(entry, r))), rules)
    } },
  { ...meta('firewall.custom_interface.update', 'Update exact custom interface access', 'Patch the rule matched by Interface and SrcIP, preserving routing, groups, tags and all other fields. Custom interfaces are not WiFi device identities. The backend does not enforce Disabled; this surface cannot disable the rule with that flag.', ['Firewall > Firewall', 'Devices'], [src('api/Firewall.js'), src('components/Firewall/AddContainerInterfaceRule.js')]),
    kind: 'write', schema: object({ Interface: s(), SrcIP: s(), changes: object({ RuleName: s(), Description: s(), RouteDst: s(), Policies: strings(), Groups: strings(), Tags: strings() }) }, ['Interface', 'SrcIP', 'changes']),
    snapshot: async (input) => one((await firewallAPI.config()).CustomInterfaceRules, (r) => r.Interface === input.Interface && r.SrcIP === input.SrcIP, 'custom-interface rule'),
    project: (input, before) => ({ ...before, ...input.changes }),
    run: (input, context) => replaceRule((r) => firewallAPI.deleteCustomInterfaceRule(r), (r) => firewallAPI.addCustomInterfaceRule(r), context.before, { ...context.before, ...input.changes }),
    verify: async (input, before) => { const rules = (await firewallAPI.config()).CustomInterfaceRules || []; return verified(rules.some((r) => fieldsMatch(r, { ...before, ...input.changes })), rules) } },
  { ...meta('firewall.mdns.update', 'Update mDNS advertisement and proxy admission', 'Change MDNSName or advertisement without disabling local proxying. Reviews and verifies both multicast settings and the dependent 5353 firewall admission.', ['Firewall > Services'], [src('api/Multicast.js'), src('components/Firewall/MDNSAdvertise.js')]),
    kind: 'write', schema: object({ changes: object({ MDNSName: s(), DisableMDNSAdvertise: boolean() }) }, ['changes']),
    snapshot: async () => ({ proxy: await Multicast.config(), ports: (await firewallAPI.config()).MulticastPorts || [] }),
    project: (input, before) => {
      const proxy = { ...before.proxy, ...input.changes }
      if (input.changes.MDNSName !== undefined) proxy.MDNSName = input.changes.MDNSName.trim().replace(/\.local\.?$/i, '')
      const local = (proxy.Addresses || []).some((a) => a.Disabled === false && a.Address.endsWith(':5353'))
      const port = !proxy.DisableMDNSAdvertise ? { Port: '5353', Upstream: true } : local ? { Port: '5353', Upstream: false } : null
      return { proxy, ports: [...before.ports.filter((p) => p.Port !== '5353'), ...(port ? [port] : [])] }
    },
    run: async (input, context) => {
      const after = operations.find((op) => op.id === 'firewall.mdns.update').project(input, context.before)
      await Multicast.setConfig(after.proxy)
      const port = after.ports.find((p) => p.Port === '5353')
      try { if (port) await firewallAPI.addMulticastPort(port); else await firewallAPI.deleteMulticastPort({ Port: '5353', Upstream: false }) }
      catch (error) { throw new Error(`Multicast settings saved; 5353 firewall update failed. Read both configurations: ${error.message || error}`) }
      return { proxyApplied: true, portApplied: true }
    },
    verify: async (input, before) => {
      const spec = operations.find((op) => op.id === 'firewall.mdns.update'), actual = await spec.snapshot(input), expected = spec.project(input, before)
      return verified(same(actual.proxy, expected.proxy) && expected.ports.length === actual.ports.length && expected.ports.every((p) => actual.ports.some((a) => same(a, p))), actual)
    } }
)

const clientSchema = object({ Identity: s(), SrcIP: s(), Group: s(), Tag: s() })
const dstSchema = object({ IP: s(), Domain: s() })
const timeSchema = object({ Days: array(enumValue([0, 1]), { maxItems: 7 }), Start: s(), End: s(), CronExpr: enumValue(['']) }, ['Days', 'Start', 'End'])
const pfwCommon = { RuleName: s(), Disabled: boolean(), Time: timeSchema, Condition: s(), Client: clientSchema }
const pfwKinds = {
  block: { key: 'BlockRules', add: 'addBlock', update: 'updateBlock', remove: 'deleteBlock', fields: { ...pfwCommon, Protocol: enumValue(['tcp', 'udp', '']), Dst: dstSchema, DstPort: s() }, required: ['Protocol', 'Dst', 'DstPort'] },
  forward: { key: 'ForwardingRules', add: 'addForward', update: 'updateForward', remove: 'deleteForward', fields: { ...pfwCommon, Protocol: enumValue(['tcp', 'udp', '']), Dst: dstSchema, DstPort: s(), OriginalDst: dstSchema, OriginalDstPort: s(), DstInterface: s() }, required: ['Protocol', 'Dst', 'OriginalDst', 'DstInterface'] },
  groups: { key: 'GroupRules', add: 'addGroups', update: 'updateGroups', remove: 'deleteGroups', fields: { ...pfwCommon, Groups: strings() }, required: ['Groups'] },
  tags: { key: 'TagRules', add: 'addTags', update: 'updateTags', remove: 'deleteTags', fields: { ...pfwCommon, Tags: strings() }, required: ['Tags'] }
}
const observedInteger = () => integer({ minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER })
const pfwSelectorFields = (type) => ({
  ...type.fields,
  Client: object(clientSchema.properties, Object.keys(clientSchema.properties)),
  Time: object({ CronExpr: s(), Start: s(), End: s(), Days: array(observedInteger(), { minItems: 7, maxItems: 7 }) }, ['CronExpr', 'Start', 'End', 'Days']),
  Expiration: observedInteger(),
  ...Object.fromEntries(['Dst', 'OriginalDst'].filter((key) => type.fields[key]).map((key) => [key, object(dstSchema.properties, Object.keys(dstSchema.properties))])),
  ...Object.fromEntries(['Protocol'].filter((key) => type.fields[key]).map((key) => [key, s()])),
  ...Object.fromEntries(['Groups', 'Tags'].filter((key) => type.fields[key]).map((key) => [key, { anyOf: [array(s()), { type: 'null' }] }]))
})
const normalizeFlowWrite = (kind, rule) => {
  const next = { Expiration: 0, ...clone(rule),
    Client: { Identity: '', Group: '', SrcIP: '', Tag: '', ...rule.Client },
    Time: { CronExpr: '', ...rule.Time, Days: rule.Time.Days.length ? [...rule.Time.Days] : Array(7).fill(0) } }
  for (const key of ['Dst', 'OriginalDst']) if (pfwKinds[kind].fields[key]) next[key] = { IP: '', Domain: '', ...rule[key] }
  for (const key of ['DstPort', 'OriginalDstPort']) if (pfwKinds[kind].fields[key]) next[key] = rule[key] ?? ''
  if (kind === 'block' && next.DstPort === '') next.DstPort = '0-65535'
  if (kind === 'forward') {
    if (next.DstInterface && next.Protocol && next.OriginalDstPort === '') next.OriginalDstPort = '0-65535'
    if (!next.DstInterface && next.DstPort === '') next.DstPort = next.OriginalDstPort
  }
  return next
}
const validateFlow = (rule, previous) => {
  required(Object.values(rule.Client || {}).filter(Boolean).length === 1, 'A PFW client needs exactly one explicit selector')
  if (!previous || !same(rule.Time, previous.Time)) {
    const time = rule.Time
    required(time.CronExpr === '', 'Only Date/Always schedules can be authored here')
    required(time.Days.length === 7 && time.Days.every((day) => day === 0 || day === 1), 'PFW Days is empty for Always or seven Sunday-first 0/1 values')
    if (time.Days.some(Boolean)) {
      required(/^([01]\d|2[0-3]):[0-5]\d$/.test(time.Start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(time.End), 'Date trigger needs valid HH:MM start/end')
    } else required(time.Start === '' && time.End === '', 'Always trigger uses empty start/end')
  }
  for (const key of ['Dst', 'OriginalDst']) {
    if (rule[key] && !(key === 'Dst' && rule.DstInterface)) required(Object.values(rule[key]).filter(Boolean).length === 1, `${key} needs exactly one explicit IP or Domain selector`)
  }
}
operations.push(read('firewall.pfw.read', 'Read programmable firewall flows', 'Read PFW rules with their current category/index. Index is not stable identity. PFW requires the PLUS plugin to be available.', ['Firewall > PFW'], [src('api/Pfw.js')], empty(), () => pfwAPI.config()))
operations.push(read('firewall.pfw.test_expression', 'Evaluate a PFW expression', 'Call the plugin expression evaluator without saving a flow. Only use a user-requested expression; this does not prove future rule execution.', ['Firewall > PFW'], [src('api/Pfw.js')], object({ expression: s() }, ['expression']), (input) => pfwAPI.testExpression(input.expression)))
for (const [kind, type] of Object.entries(pfwKinds)) {
  const shared = { menus: ['Firewall > PFW'], sources: [src('api/Pfw.js'), src('components/Flow/FlowCards.js')], featureGates: ['PLUS', 'pfw plugin available'] }
  const getRules = async () => {
    const config = await pfwAPI.config()
    required(config && Object.prototype.hasOwnProperty.call(config, type.key) && (config[type.key] === null || Array.isArray(config[type.key])), `Missing ${type.key} evidence; refresh PFW settings`)
    return clone(config[type.key] || [])
  }
  const writeRule = (rule, previous) => { const next = normalizeFlowWrite(kind, rule); validateFlow(next, previous); return next }
  const addProject = (input, before) => { const rule = writeRule(input.rule); required(!before.some((r) => same(r, rule)), 'This exact flow already exists'); return [...before, rule] }
  const selectorFields = pfwSelectorFields(type)
  operations.push({ ...meta(`firewall.pfw.${kind}.add`, `Add PFW ${kind} flow`, 'Create a scoped Date/Always flow. Preserve intended client, destination and router-local schedule; groups/tags arrays replace action membership.', shared.menus, shared.sources), featureGates: shared.featureGates, kind: 'write',
    schema: object({ rule: object(type.fields, ['RuleName', 'Disabled', 'Time', 'Condition', 'Client', ...type.required]) }, ['rule']), snapshot: getRules,
    project: addProject,
    run: (input, context) => { const expected = addProject(input, context.before); return pfwAPI[type.add](expected[expected.length - 1]) },
    verify: async (input, before) => { const after = await getRules(); return verified(same(after, addProject(input, before)), after) } })
  for (const operation of ['update', 'delete']) {
    operations.push({ ...meta(`firewall.pfw.${kind}.${operation}`, `${operation === 'update' ? 'Update' : 'Delete'} exact PFW ${kind} flow`, 'Copy the complete selected rule from firewall.pfw.read, including CronExpr and Expiration, not its UI index. Reject missing/duplicate matches. Patches preserve other fields; Time replaces the entire schedule with Date/Always.', shared.menus, shared.sources), featureGates: shared.featureGates, kind: 'write',
      schema: object({ previousRule: object(selectorFields, Object.keys(selectorFields)), ...(operation === 'update' ? { changes: object(type.fields) } : {}) }, operation === 'update' ? ['previousRule', 'changes'] : ['previousRule']),
      snapshot: async (input) => { const rules = await getRules(); const rule = one(rules, (r) => same(r, input.previousRule), 'PFW flow'); return { rules, rule, index: rules.findIndex((r) => same(r, rule)) } },
      project: (input, before) => { if (operation === 'delete') return { category: type.key, removed: before.rule }; required(Object.keys(input.changes).length > 0, 'At least one changed field is required'); return writeRule({ ...before.rule, ...clone(input.changes) }, before.rule) },
      run: (input, context) => operation === 'delete' ? pfwAPI[type.remove](context.before.index) : pfwAPI[type.update](writeRule({ ...context.before.rule, ...clone(input.changes) }, context.before.rule), context.before.index),
      verify: async (input, before) => {
        const after = await getRules(), expected = clone(before.rules)
        if (operation === 'delete') expected.splice(before.index, 1)
        else expected[before.index] = writeRule({ ...before.rule, ...clone(input.changes) }, before.rule)
        return verified(same(after, expected), after)
      } })
  }
}

const blockSource = [src('api/DNS.js')]
const blocklistRows = value => {
  required(value === null || Array.isArray(value), 'DNS blocklist inventory unavailable; refresh before changing lists')
  return value === null ? [] : clone(value)
}
const blocklistNext = (input, before) => {
  const rows = blocklistRows(before), matches = rows.filter(row => row?.URI === input.URI)
  required(input.URI.length > 0, 'A nonempty blocklist URI is required')
  required(matches.length <= 1, 'Duplicate blocklist URI; refresh or resolve the list identity before changing it')
  if (!matches.length) return [...rows, { Tags: null, Category: '', DontBlock: false, ...clone(input) }]
  const selected = matches[0]
  required(typeof selected.Enabled === 'boolean' &&
    (selected.Tags === null || (Array.isArray(selected.Tags) && selected.Tags.every(tag => typeof tag === 'string'))) &&
    typeof selected.Category === 'string' && typeof selected.DontBlock === 'boolean',
  'Incomplete blocklist attributes; cannot preserve Tags, Category and DontBlock without current evidence')
  return rows.map(row => row?.URI === input.URI ? { ...row, ...clone(input) } : row)
}
operations.push(
  { ...meta('dns.blocklist.put', 'Add or update one DNS blocklist', 'Set the exact URI and Enabled state. Optional DontBlock=false blocks matches; true only observes them. Omit it to preserve mode. Optional Tags changes list scope; empty Tags is global and requires an explicit request for every device. Omit Tags to preserve scope. Preserve unrelated lists.', BLOCK, blockSource), kind: 'write', schema: object({ URI: s(), Enabled: boolean(), DontBlock: boolean(), Tags: strings() }, ['URI', 'Enabled']),
    snapshot: async () => blocklistRows(await blockAPI.blocklists()), project: blocklistNext,
    run: async (input, context) => blockAPI.putBlocklist(blocklistNext(input, context.before).find(row => row?.URI === input.URI)),
    verify: async (input, before) => { const after = blocklistRows(await blockAPI.blocklists()); return verified(same(after, blocklistNext(input, before)), after) } },
  { ...meta('dns.blocklist.delete', 'Remove one exact DNS blocklist', 'Delete the uniquely matched URI and preserve all other filtering configuration.', BLOCK, blockSource), kind: 'write', schema: object({ URI: s() }, ['URI']),
    snapshot: async (input) => one(await blockAPI.blocklists(), (l) => l.URI === input.URI, 'blocklist URI'), project: (input, before) => ({ removed: before }),
    run: (input, context) => blockAPI.deleteBlocklist(context.before), verify: async (input) => { const after = await blockAPI.blocklists(); return verified(!after.some((l) => l.URI === input.URI), after) } },
  { ...meta('dns.block.refresh_interval', 'Set DNS blocklist refresh interval', 'Change only the refresh period in seconds, preserving active lists and overrides.', BLOCK, blockSource), kind: 'write', schema: object({ seconds: integer({ minimum: 1, maximum: 31536000 }) }, ['seconds']),
    snapshot: () => blockAPI.config(), project: (input, before) => ({ ...before, RefreshSeconds: input.seconds }), run: (input) => blockAPI.setRefresh(input.seconds),
    verify: async (input) => { const after = await blockAPI.config(); return verified(after.RefreshSeconds === input.seconds, after) } },
  { ...meta('dns.override.put', 'Add a scoped DNS permit/block override', 'Select the exact override list and client IP. Keep ResultIP and ResultCNAME mutually exclusive; a DNS permit does not grant firewall reachability.', BLOCK, [src('api/DNS.js'), src('components/DNS/DNSAddOverride.js')]), kind: 'write',
    schema: object({ listName: s(), Type: enumValue(['block', 'permit']), Domain: s(), ClientIP: s(), ResultIP: s(), ResultCNAME: s(), Expiration: number({ minimum: 0 }) }, ['listName', 'Type', 'Domain', 'ClientIP', 'ResultIP', 'ResultCNAME', 'Expiration']),
    snapshot: async (input) => { pathSegment(input.listName); return one((await blockAPI.config()).OverrideLists, (list) => list.Name === input.listName, 'override list') },
    project: (input) => { required(input.ClientIP === '*' || ipv4(input.ClientIP), 'ClientIP must be IPv4 or explicit *'); required(!input.ResultIP || ipv4(input.ResultIP), 'ResultIP must be IPv4'); required(!(input.ResultIP && input.ResultCNAME), 'Choose either ResultIP or ResultCNAME'); return { ...pick(input, ['Type', 'ClientIP', 'ResultIP', 'Expiration']), Domain: domainName(input.Domain), ResultCNAME: input.ResultCNAME ? domainName(input.ResultCNAME) : '' } },
    run: (input, context) => blockAPI.putOverride(input.listName, operations.find((op) => op.id === 'dns.override.put').project(input, context.before)),
    verify: async (input, before) => {
      const spec = operations.find((op) => op.id === 'dns.override.put'), list = await spec.snapshot(input)
      const key = input.Type === 'permit' ? 'PermitDomains' : 'BlockDomains', expected = spec.project(input, before)
      const { Expiration, ...identityAndResult } = expected
      const matches = (list[key] || []).filter((row) => fieldsMatch({ ...row, Type: input.Type }, identityAndResult))
      if (Expiration === 0) return verified(matches.some((row) => row.Expiration === 0), list)
      if (!matches.some((row) => Number.isFinite(row.Expiration) && row.Expiration > 0)) return verified(false, list)
      return { verified: null, summary: 'The requested DNS entry fields were read back with a positive expiration deadline. Requested duration and whether it is currently unexpired remain unverified: router-clock and processing-delay evidence are unavailable.', data: list }
    } },
  { ...meta('dns.override_list.update', 'Update an override list scope or enabled state', 'Update only Tags/Enabled on the exact existing list, preserving permit/block entries and unrelated lists. The backend rejects every list-level mutation of Default, including Enabled and empty Tags.', BLOCK, [src('api/DNS.js'), src('views/DNS/DNSOverride.js')]), kind: 'write', schema: object({ name: s(), changes: object({ Tags: strings(), Enabled: boolean() }) }, ['name', 'changes']),
    snapshot: async (input) => { pathSegment(input.name); return one((await blockAPI.config()).OverrideLists, (l) => l.Name === input.name, 'override list') },
    project: (input, before) => { required(input.name !== 'Default', 'Default list does not support list-level mutations'); return { ...before, ...input.changes, ...(input.changes.Tags ? { Tags: unique(input.changes.Tags.map((t) => t.trim().toLowerCase()).filter(Boolean)) } : {}) } },
    run: (input, context) => blockAPI.putOverrideList(input.name, operations.find((op) => op.id === 'dns.override_list.update').project(input, context.before)),
    verify: async (input, before) => { const spec = operations.find((op) => op.id === 'dns.override_list.update'), actual = await spec.snapshot(input); return verified(same(actual, spec.project(input, before)), actual) } }
)

for (const action of ['create', 'update', 'delete', 'reset']) {
  const extra = action === 'create' ? { IPAddress: s() } : action === 'update' ? { IPAddress: s(), PreviousIPAddress: s() } : action === 'delete' ? { IPAddress: s() } : {}
  operations.push({ ...meta(`dns.hostname.${action}`, `${action} local DNS hostname`, 'Use an exact normalized name. CreateOnly prevents overwrite; updates/deletes guard the previous address. Reset removes a pinned override without deleting the device.', HOSTS, [src('api/CoreDNS.js'), src('components/DNS/DNSHostnameForm.js'), src('views/DNS/DNSHostnames.js')]), kind: 'write', schema: object({ hostname: s(), ...extra }, ['hostname', ...Object.keys(extra)]),
    snapshot: async (input) => { const name = normalizeHost(input.hostname); const all = await CoreDNS.hostnames(); return { name, records: all.filter((row) => row.Hostname === name) } },
    project: (input, before) => {
      if (input.IPAddress !== undefined) required(ipv4(input.IPAddress), 'This hostname form requires a valid IPv4 address')
      if (action === 'create') required(before.records.length === 0, 'Hostname already exists')
      else {
        required(before.records.length > 0, 'Hostname no longer exists')
        if (action === 'update' || action === 'delete') one(before.records, (r) => r.IPAddress === (input.PreviousIPAddress || input.IPAddress), 'previous hostname address')
      }
      return { hostname: before.name, action, ...pick(input, Object.keys(extra)) }
    },
    run: (input, context) => {
      const name = context.before.name
      if (action === 'create') return CoreDNS.putHostname(name, { IPAddress: input.IPAddress, CreateOnly: true })
      if (action === 'update') return CoreDNS.putHostname(name, { IPAddress: input.IPAddress, PreviousIPAddress: input.PreviousIPAddress })
      if (action === 'delete') return CoreDNS.deleteHostname(name, { IPAddress: input.IPAddress })
      return CoreDNS.resetHostname(name)
    },
    verify: async (input, before) => {
      const all = await CoreDNS.hostnames(), rows = all.filter((r) => r.Hostname === before.name)
      if (action === 'reset') return { verified: null, summary: 'Reset request completed; refreshed hostname records are evidence. Device identity is retained.', data: rows }
      return verified(action === 'delete' ? !rows.some((r) => r.IPAddress === input.IPAddress) : rows.some((r) => r.IPAddress === input.IPAddress), rows)
    } })
}

operations.push(
  read('dns.log.query', 'Query bounded per-client DNS history', 'Query explicit client IP buckets with min/max timestamps, then filter the bounded returned sample by domain/type. Report limits; empty/failed/ignored history is not proof of no activity.', ['DNS > DNS Log'], [src('api/Db.js'), src('components/DNS/DNSLogHistoryList.js')], object({ clientIPs: array(s(), { minItems: 1, maxItems: 16, uniqueItems: true }), min: s(), max: s(), limit: integer({ minimum: 1, maximum: 1000 }), domain: s(), responseType: enumValue(['', 'BLOCKED', 'NOERROR', 'NODATA', 'OTHERERROR', 'NXDOMAIN']) }, ['clientIPs', 'min', 'max', 'limit']), async (input) => {
    required(input.clientIPs.every(ipv4), 'DNS history requires explicit IPv4 clients')
    required(Number.isFinite(Date.parse(input.min)) && Number.isFinite(Date.parse(input.max)) && Date.parse(input.min) < Date.parse(input.max), 'Choose a valid start/end time range')
    const result = []
    for (const ip of input.clientIPs) {
      const bucket = `dns:serve:${ip}`
      try {
        const raw = await dbAPI.items(bucket, { min: input.min, max: input.max, num: input.limit }), stats = await dbAPI.stats(bucket)
        const records = raw.filter((r) => (!input.domain || String(r.FirstName || '').toLowerCase().replace(/\.$/, '') === input.domain.toLowerCase().replace(/\.$/, '')) && (!input.responseType || r.Type === input.responseType))
        result.push({ clientIP: ip, fetched: raw.length, bucketTotal: stats.KeyN, potentiallyTruncated: raw.length >= input.limit, records })
      } catch (error) { result.push({ clientIP: ip, error: String(error.message || error), records: null }) }
    }
    return { requestedRange: { min: input.min, max: input.max }, filterScope: 'bounded returned records only', clients: result }
  }),
  { ...meta('dns.log.privacy_add', 'Exclude a client from future DNS logging', 'Append one client IP to the existing privacy list. Does not delete retained history or alter filtering.', ['DNS > DNS Log'], [src('api/DNS.js'), src('components/DNS/DNSLogList.js')]), kind: 'write', schema: object({ clientIP: s() }, ['clientIP']), snapshot: () => logAPI.hostPrivacyList(),
    project: (input, before) => { required(ipv4(input.clientIP), 'Client must be an IPv4 address'); return unique([...before, input.clientIP]) }, run: (input, context) => logAPI.putHostPrivacyList(unique([...context.before, input.clientIP])),
    verify: async (input, before) => { const after = await logAPI.hostPrivacyList(); return verified(same(after, unique([...before, input.clientIP])), after) } },
  { ...meta('dns.log.ignore_domain', 'Exclude one domain from DNS logs', 'Add one ignored domain to the logging filter. Does not permit DNS requests or delete existing log history.', ['DNS > DNS Log'], [src('api/DNS.js'), src('components/DNS/DNSLogList.js')]), kind: 'write', schema: object({ domain: s() }, ['domain']), snapshot: () => logAPI.domainIgnores(),
    project: (input, before) => { pathSegment(input.domain); domainName(input.domain); return unique([...before, input.domain]) }, run: (input) => logAPI.putDomainIgnore(input.domain),
    verify: async (input) => { const after = await logAPI.domainIgnores(); return verified(after.includes(input.domain), after) } }
)

const providerSchema = object({ IPAddress: s(), TLSHost: s(), DisableTls: boolean() }, ['IPAddress', 'TLSHost', 'DisableTls'])
const dnsSettingsProject = (input, before) => {
  required(Object.keys(input.changes).length > 0, 'At least one changed field is required')
  const after = { ...clone(before), ...clone(input.changes) }
  for (const [key, ip, host, disabled] of [
    ['UpstreamProviders', 'UpstreamIPAddress', 'UpstreamTLSHost', 'DisableTls'],
    ['FamilyProviders', 'UpstreamFamilyIPAddress', 'UpstreamFamilyTLSHost', 'DisableFamilyTls']
  ]) {
    required(typeof after[ip] === 'string' && typeof after[host] === 'string' && typeof after[disabled] === 'boolean',
      `Incomplete DNS legacy fields for ${key}; refresh DNS settings`)
    required(after[key] === null || Array.isArray(after[key]), `Missing ${key} evidence; refresh DNS settings`)
    required((after[key] || []).every((provider) => provider && typeof provider.IPAddress === 'string' &&
      typeof provider.TLSHost === 'string' && typeof provider.DisableTls === 'boolean'),
    `Incomplete ${key} provider fields; refresh DNS settings`)
    if (!after[key]?.length && after[ip] !== '') {
      after[key] = [{ IPAddress: after[ip], TLSHost: after[host], DisableTls: after[disabled] }]
    }
    if (after[key]?.length) {
      after[ip] = after[key][0].IPAddress
      after[host] = after[key][0].TLSHost
      after[disabled] = after[key][0].DisableTls
    }
    for (const field of [key, ip, host, disabled]) {
      if (Object.prototype.hasOwnProperty.call(input.changes, field)) {
        required(same(after[field], input.changes[field]),
          `${field} would be overwritten by DNS provider migration; supply the intended ${key} and matching legacy fields, or clear its legacy IP together with an empty array`)
      }
    }
  }
  return after
}
operations.push(
  { ...meta('dns.settings.update', 'Update primary/family DNS providers', 'Patch only requested DNS provider settings. Preserve the other resolver family and provider order; this is separate from rebinding and router-host DNS override. Provider arrays determine legacy fields; conflicting requests are rejected.', DNS_SETTINGS, [src('api/CoreDNS.js'), src('views/DNS/CoreDns.js'), 'api/code/dns.go']), kind: 'write',
    schema: object({ changes: object({ UpstreamIPAddress: s(), UpstreamTLSHost: s(), DisableTls: boolean(), UpstreamFamilyIPAddress: s(), UpstreamFamilyTLSHost: s(), DisableFamilyTls: boolean(), UpstreamProviders: array(providerSchema), FamilyProviders: array(providerSchema) }) }, ['changes']),
    snapshot: () => CoreDNS.config(), project: dnsSettingsProject,
    run: (input, context) => CoreDNS.setConfig(dnsSettingsProject(input, context.before)),
    verify: async (input, before) => { const after = await CoreDNS.config(); return verified(same(after, dnsSettingsProject(input, before)), after) } },
  { ...meta('dns.rebinding.update', 'Set DNS rebinding protection', 'DisableRebinding true removes broad rebinding protection. Investigate actual DNS evidence first; this is not a one-domain permit.', DNS_SETTINGS, [src('api/DNS.js')]), kind: 'write', schema: object({ disabled: boolean() }, ['disabled']), snapshot: rebindingProtection, project: (input) => ({ DisableRebinding: input.disabled }), run: (input) => blockAPI.disableRebinding(input.disabled), verify: async (input) => { const after = await rebindingProtection(); return verified(after.DisableRebinding === input.disabled, after) } },
  { ...meta('dns.system_override.update', 'Set or clear router-host DNS override', 'Change only SystemDNSOverride. An empty address clears it; client-facing resolver configuration is preserved.', DNS_SETTINGS, [src('api/Firewall.js'), src('views/DNS/CoreDns.js')]), kind: 'write', schema: object({ address: s() }, ['address']), snapshot: async () => pick(await firewallAPI.config(), ['SystemDNSOverride']), project: (input) => { required(input.address === '' || ipv4(input.address), 'Use an IPv4 address or empty string to clear'); return { SystemDNSOverride: input.address } }, run: (input) => firewallAPI.setSystemDnsOverride(input.address), verify: async (input) => { const after = pick(await firewallAPI.config(), ['SystemDNSOverride']); return verified((after.SystemDNSOverride || '') === input.address, after) } }
)

const sanitizeDynDns = (value) => {
  if (value === null || typeof value !== 'object') return value
  if (Object.prototype.hasOwnProperty.call(value, 'verified')) return { ...pick(value, ['verified', 'summary']), data: sanitizeDynDns(value.data) }
  return {
  ...pick(value, ['provider', 'ip_type', 'interval']),
  ip_urls: (value.ip_urls || []).map((text) => {
    try { const url = new URL(text); url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.toString() }
    catch { return '[invalid URL omitted]' }
  }),
  domains: (value.domains || []).map((domain) => pick(domain, ['domain_name', 'sub_domains']))
  }
}
operations.push(
  read('dns.dyndns.read', 'Read nonsecret Dynamic DNS configuration', 'Read only provider name, address family, interval, public-IP lookup URLs and domain/subdomain selection. Provider credentials are never returned.', ['DNS > Dynamic DNS'], [src('api/Dyndns.js')], empty(), async () => sanitizeDynDns(await dyndnsAPI.config())),
  patchWrite({ id: 'dns.dyndns.update', label: 'Update nonsecret Dynamic DNS settings', description: 'Patch address family, interval, lookup URLs or domains. Preserve the complete raw provider configuration and credentials privately. Publishing an address does not establish connectivity.', menus: ['DNS > Dynamic DNS'], sources: [src('api/Dyndns.js'), src('views/DNS/DynDns.js')], fields: { ip_type: enumValue(['IPv4', 'IPv6']), interval: integer({ minimum: 1, maximum: 31536000 }), ip_urls: strings(), domains: array(object({ domain_name: s(), sub_domains: strings() }, ['domain_name', 'sub_domains'])) }, get: () => dyndnsAPI.config(), put: (data) => dyndnsAPI.setConfig(data), redact: sanitizeDynDns,
    validate: (input) => {
      for (const url of input.changes.ip_urls || []) { const parsed = new URL(url); required(['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password, 'Public-IP URL must use HTTP(S) without credentials') }
      const domains = input.changes.domains
      if (domains) required(unique(domains.map((d) => d.domain_name)).length === domains.length, 'Duplicate Dynamic DNS domain')
    } }),
  { ...meta('dns.dyndns.provider_setup', 'Open provider credential setup', 'Provider credentials are genuine protected input: configure them in the plugin/provider UI, never paste tokens into assistant chat.', ['DNS > Dynamic DNS'], [src('views/DNS/DynDns.js')]), kind: 'ui', route: '/admin/dyndns', instructions: 'Inspect the Dynamic DNS screen. If provider configuration is absent, use its Plugins link and the provider-specific protected setup. Keep credentials outside chat.', schema: empty(), run: () => ({ route: '/admin/dyndns', instructions: 'Inspect the Dynamic DNS screen. If provider configuration is absent, use its Plugins link and the provider-specific protected setup. Keep credentials outside chat.' }) },
  read('assistant.runtime.read', 'Read browser assistant capability state', 'Read secure-context and WebGPU availability; model download/runtime settings require the assistant UI state, not router APIs.', ['AI Assistant'], [src('components/Assistant/webllmRuntime.web.js')], empty(), async (_, context = {}) => ({ secureContext: typeof window !== 'undefined' ? window.isSecureContext : null, webgpuAvailable: typeof navigator !== 'undefined' ? Boolean(navigator.gpu) : false, ...(context.ui?.assistantState ? await context.ui.assistantState() : {}) }))
)

export default operations
