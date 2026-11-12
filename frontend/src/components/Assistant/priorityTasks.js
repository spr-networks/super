import { parentalAPI, blockAPI, firewallAPI, groupAPI, pfwAPI, wanAPI, wifiAPI, wireguardAPI } from 'api'
import { deviceAPI } from './assistantDeviceApi'
import { Address4, Address6 } from 'ip-address'
import { array, boolean, enumValue, integer, object, string } from './operationSchema'
import { DEFAULT_AD_BLOCKLIST_URI } from '../DNS/blocklistPresets'
import { matchRef, cloneTask as clone, sameTaskState as same, need, rows, exact, deviceId, deviceRef, deviceRefs,
  selectDevices, publicDevice, windowsSchema, compileWindows, executeTaskSteps, taskReceipt } from './taskRuntime'

const devices = async () => {
  const value = await deviceAPI.list()
  need(value && typeof value === 'object' && !Array.isArray(value), 'Device inventory unavailable')
  return Object.values(value).map(publicDevice)
}
const tags = d => rows(d.DeviceTags, 'Device tags')
const policies = d => rows(d.Policies, 'Device policies')
const merge = (a, b) => [...new Set([...a, ...b])]
const label = text => string({ minLength: 1, maxLength: 256, description: text })
const fieldsSame = (a, b) => a != null && Object.keys(b).every(key => same(a[key], b[key]))
const ip = value => {
  need(typeof value === 'string' && !value.includes('/'), 'A current device IP is required')
  try { return value.includes(':') ? new Address6(value).correctForm() : new Address4(value).correctForm() }
  catch { throw new Error('A selected device has an invalid IP address') }
}
const uniqueIP = (all, selected) => {
  const address = ip(selected.RecentIP)
  need(all.filter(d => d.RecentIP === selected.RecentIP).length === 1, 'Device IP is shared or ambiguous; resolve it before granting access')
  return address
}
const portSchema = () => integer({ minimum: 1, maximum: 65535 })
const stamp = value => {
  let hash = 2166136261
  for (const c of value) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(16)
}
const deviceStep = (before, after) => ({ label: `Device ${before.Name || deviceId(before)}`,
  before, after, read: async () => exact(await devices(), d => deviceId(d) === deviceId(before), 'device identity'),
  write: () => deviceAPI.update(deviceId(before), Object.fromEntries(['DeviceTags', 'Policies'].filter(key => !same(before[key], after[key])).map(key => [key, after[key]]))) })
const configVerification = (result, confirmed, data, summary) => ({ verified: Boolean(result.complete && confirmed),
  summary: result.complete ? summary : 'Only some setup steps may have applied. Inspect the step receipts before continuing.', data })
const common = (id, label, description, schema, menus = ['Devices']) => ({ id, label, description, schema,
  domain: 'tasks', task: true, kind: 'write', menus, sources: ['frontend/src/components/Assistant/priorityTasks.js', 'api/code/parentalcontrols.go', 'api/code/firewall.go'] })

const familySnapshot = async () => ({ personas: rows(await parentalAPI.personas(), 'Family personas'), devices: await devices() })
const familyProject = (input, before) => {
  need(input.dailyMinutes !== undefined || input.blockedDuring !== undefined, 'Choose a daily limit or blocked hours for the child')
  const matches = matchRef(before.personas, input.persona, ['Name', 'Tag'])
  need(matches.length <= 1, 'Family name is ambiguous; select the exact persona')
  const existing = matches[0]
  need(existing || !input.persona.startsWith('persona:'), 'To create a child, give their name rather than inventing a persona tag')
  const label = input.persona.trim().toLowerCase().replace(/\s+/g, '-')
  need(existing || label, 'Give the persona a name')
  const tag = existing?.Tag || `persona:${label}`
  need(tag.startsWith('persona:'), 'The existing persona has an unsupported membership tag')
  if (!existing) need(!before.devices.some(d => tags(d).includes(tag)), 'That persona tag already belongs to devices without a matching persona; resolve the orphaned membership first')
  const persona = existing ? clone(existing) : { Name: label, Tag: tag, Description: '', DailyLimitMinutes: 0, Schedules: [], DNSFamily: false, Disabled: false }
  need(before.personas.filter(p => p.Name === persona.Name).length <= 1, 'Persona name is not unique')
  need(['Description', 'DailyLimitMinutes', 'Schedules', 'DNSFamily', 'Disabled'].every(k => persona[k] !== undefined), 'Persona settings are incomplete')
  persona.Disabled = false
  if (input.dailyMinutes !== undefined) persona.DailyLimitMinutes = input.dailyMinutes
  if (input.blockedDuring !== undefined) persona.Schedules = compileWindows(input.blockedDuring)
  if (input.familyDns !== undefined) persona.DNSFamily = input.familyDns
  const selected = selectDevices(before.devices, input.devices)
  const selectedIds = new Set(selected.map(deviceId))
  const unselectedMembers = before.devices.filter(d => tags(d).includes(tag) && !selectedIds.has(deviceId(d)))
  need(!unselectedMembers.length || same(persona, existing), 'This persona also includes other devices. Include all its members before changing shared limits.')
  const nextPersonas = existing ? before.personas.map(p => p.Tag === tag ? persona : p) : [...before.personas, persona]
  const nextDevices = before.devices.map(d => {
    if (!selectedIds.has(deviceId(d))) return d
    const nextTags = merge(tags(d), [tag])
    const needsFamily = nextPersonas.some(p => nextTags.includes(p.Tag) && p.DNSFamily)
    const nextPolicies = needsFamily ? merge(policies(d), ['dns:family'])
      : input.familyDns === false ? policies(d).filter(p => p !== 'dns:family') : policies(d)
    return { ...d, DeviceTags: nextTags, Policies: nextPolicies }
  })
  return { personas: nextPersonas, devices: nextDevices }
}
const familySetup = {
  ...common('tasks.family.setup', 'Add or update a persona and its Internet limits (Devices > Personas)',
    'Create or update an exact named family persona, assign the explicitly selected devices, and set dailyMinutes and/or blockedDuring. Other memberships are preserved. Optional familyDns controls family DNS filtering. Code constructs schedules and preserves existing settings. Include all current members when changing an existing persona’s shared limits.',
    object({ persona: label('Child/persona name'), devices: deviceRefs(), dailyMinutes: integer({ minimum: 0, maximum: 1440 }), blockedDuring: windowsSchema(), familyDns: boolean() }, ['persona', 'devices'])),
  relatedDomains: ['devices'], snapshot: familySnapshot, project: familyProject,
  noChangeSummary: 'The child, device memberships and requested limits are already configured. No changes were sent. Temporary grants may still override blocking.',
  run: async (input, context) => {
    const before = context.before, after = context.after
    const wanted = matchRef(after.personas, input.persona, ['Name', 'Tag'])[0]
    const old = before.personas.find(p => p.Tag === wanted.Tag) || null
    const steps = [{ label: `Family persona ${wanted.Name}`, before: old, after: wanted,
      read: async () => {
        const all = rows(await parentalAPI.personas(), 'Family personas')
        const found = all.filter(p => p.Tag === wanted.Tag || p.Name === wanted.Name)
        need(found.length <= 1, 'Persona identity changed')
        return found[0] || null
      }, write: () => parentalAPI.savePersona(wanted) }]
    after.devices.forEach((d, i) => { if (!same(d, before.devices[i])) steps.push(deviceStep(before.devices[i], d)) })
    return executeTaskSteps(steps)
  },
  verify: async (input, before, result) => {
    const actual = await familySnapshot(), expected = familyProject(input, before)
    return configVerification(result, same(actual, expected), { persona: matchRef(actual.personas, input.persona, ['Name', 'Tag'])[0], usage: await parentalAPI.usage() },
      'Family limits and device assignments are configured and read back. Usage counts active Internet minutes, resets at 06:00 router time, and temporary grants can override blocking.')
  }
}

const adsSnapshot = async () => ({ lists: rows(await blockAPI.blocklists(), 'DNS lists'), devices: await devices() })
const adsProject = (input, before) => {
  const selected = selectDevices(before.devices, input.devices)
  const matches = before.lists.filter(l => l.URI === DEFAULT_AD_BLOCKLIST_URI)
  need(matches.length <= 1, 'Default ad list is duplicated')
  const old = matches[0]
  if (old) need(typeof old.Enabled === 'boolean' && typeof old.DontBlock === 'boolean' && typeof old.Category === 'string', 'Ad list metadata is incomplete')
  const oldTags = old ? rows(old.Tags, 'Ad list scope') : []
  if (old?.Enabled && !old.DontBlock && !oldTags.length) return clone(before)
  if (old) need(!old.Enabled && !oldTags.length || !old.DontBlock && old.Enabled,
    'The existing ad list has a different staged or observation scope. Review that policy before enabling blocking for these devices.')
  const ids = new Set(selected.map(deviceId))
  const taskTag = oldTags.find(t => t === 'adblock') || 'adblock'
  const list = { ...(old || { URI: DEFAULT_AD_BLOCKLIST_URI, Category: 'ads' }), Enabled: true, DontBlock: false, Tags: merge(oldTags, [taskTag]) }
  return { lists: old ? before.lists.map(l => l.URI === list.URI ? list : l) : [...before.lists, list],
    devices: before.devices.map(d => ids.has(deviceId(d)) ? { ...d, DeviceTags: merge(tags(d), [taskTag]) } : d) }
}
const adsDevices = {
  ...common('tasks.ads.devices', 'Block ads for selected devices', 'Enable DNS ad filtering only for exact selected devices. Code tags the selected devices with adblock and scopes the default ad list to that tag; devices already carrying the tag stay covered. Once the list is scoped to a tag it no longer blocks for devices without it, and a domain that is also on another global list follows the tagged list. A global blocking list already covers selected devices. Staged/observation scopes are not silently converted.', object({ devices: deviceRefs() }, ['devices']), ['DNS > Blocklists/Ad-Block']),
  relatedDomains: ['dns', 'devices'], snapshot: adsSnapshot, project: adsProject,
  noChangeSummary: 'The existing global DNS ad-blocking list already covers these devices. No changes were sent; actual filtering still needs verification.',
  run: async (input, context) => {
    const steps = []
    context.after.devices.forEach((d, i) => { if (!same(d, context.before.devices[i])) steps.push(deviceStep(context.before.devices[i], d)) })
    steps.push({ label: 'Scoped DNS ad list', before: context.before.lists, after: context.after.lists,
      read: async () => rows(await blockAPI.blocklists(), 'DNS lists'),
      write: () => blockAPI.putBlocklist(context.after.lists.find(l => l.URI === DEFAULT_AD_BLOCKLIST_URI)) })
    return executeTaskSteps(steps)
  },
  verify: async (input, before, result) => {
    const actual = await adsSnapshot()
    return configVerification(result, same(actual, adsProject(input, before)), { lists: actual.lists },
      'DNS ad-list scope and device tags are configured and read back. Test a known listed domain from a selected client; clients bypassing SPR DNS may bypass filtering.')
  }
}

const accessSnapshot = async () => {
  const firewall = await firewallAPI.config()
  return { devices: await devices(), endpoints: rows(firewall?.Endpoints, 'Service endpoints'), blocks: rows(firewall?.ForwardingBlockRules, 'Forwarded blocks') }
}
const accessProject = (input, before, action) => {
  const source = selectDevices(before.devices, input.sources), target = selectDevices(before.devices, [input.destination])[0]
  need(!source.some(d => deviceId(d) === deviceId(target)), 'Source and destination must be different devices')
  const address = uniqueIP(before.devices, target)
  if (action === 'block') {
    const additions = source.map(d => ({ RuleName: `SPR assistant block ${stamp(`${deviceId(d)}|${deviceId(target)}|${input.protocol}|${input.port}`)}`,
      Description: 'Selected device service block', Disabled: false, Protocol: input.protocol, SrcIP: uniqueIP(before.devices, d), DstIP: address, DstPort: String(input.port) }))
    const blocks = [...before.blocks]
    for (const rule of additions) {
      const found = blocks.filter(b => b.Protocol === rule.Protocol && b.SrcIP === rule.SrcIP && b.DstIP === rule.DstIP && b.DstPort === rule.DstPort)
      need(found.length <= 1, 'A duplicate block for this service already exists; remove the extra on the Firewall page')
      if (!found.length) blocks.push(rule)
    }
    return { ...before, blocks }
  }
  const ids = new Set(source.map(deviceId)), signature = `${[...ids].sort()}|${deviceId(target)}|${input.protocol}|${input.port}`
  const tag = `spr:service:${stamp(signature)}`, name = `SPR assistant service ${stamp(signature)}`
  need(!before.devices.some(d => !ids.has(deviceId(d)) && tags(d).includes(tag)), 'Service scope tag is already assigned to another device')
  const rule = { RuleName: name, Description: 'Access for explicitly selected devices', Disabled: false,
    Protocol: input.protocol, IP: address, Domain: '', Port: String(input.port), Tags: [tag] }
  const found = before.endpoints.filter(r => r.RuleName === name || rows(r.Tags, 'Endpoint tags').includes(tag))
  need(found.length <= 1 && (!found.length || same(found[0], rule)), 'Existing service scope conflicts; no access was widened')
  return { ...before, endpoints: found.length ? before.endpoints : [...before.endpoints, rule],
    devices: before.devices.map(d => ids.has(deviceId(d)) ? { ...d, DeviceTags: merge(tags(d), [tag]) } : d) }
}
const accessTasks = ['allow', 'block'].map(action => ({
  ...common(`tasks.access.${action}`, `${action === 'allow' ? 'Allow' : 'Block'} one service between devices`,
    `${action === 'allow' ? 'Grant' : 'Block'} only the explicitly requested protocol and port from named source devices to one named destination. Code resolves addresses and preserves other permissions. Ask for missing protocol/port; never substitute all traffic. This changes configuration, not a measured application result.`,
    object({ sources: deviceRefs(), destination: deviceRef(), protocol: enumValue(['tcp', 'udp']), port: portSchema() }, ['sources', 'destination', 'protocol', 'port']), ['Firewall > Firewall']),
  relatedDomains: ['firewall', 'network', 'devices'], snapshot: accessSnapshot,
  project: (input, before) => accessProject(input, before, action),
  noChangeSummary: 'The requested service rule and its scope are already configured. No changes were sent. Application connectivity has not been tested.',
  run: async (input, context) => {
    const before = context.before, after = context.after, steps = []
    if (action === 'allow') {
      after.devices.forEach((d, i) => { if (!same(d, before.devices[i])) steps.push(deviceStep(before.devices[i], d)) })
      for (const rule of after.endpoints.filter(r => !before.endpoints.some(old => same(old, r)))) steps.push({ label: 'Scoped service endpoint',
        before: before.endpoints, after: after.endpoints, read: async () => rows((await firewallAPI.config()).Endpoints, 'Service endpoints'), write: () => firewallAPI.addEndpoint(rule) })
    } else {
      let prior = before.blocks
      for (const rule of after.blocks.filter(r => !before.blocks.some(old => same(old, r)))) {
        const next = [...prior, rule]
        steps.push({ label: `Block ${rule.SrcIP} to ${rule.DstIP}:${rule.DstPort}`, before: prior, after: next,
          read: async () => rows((await firewallAPI.config()).ForwardingBlockRules, 'Forwarded blocks'), write: () => firewallAPI.addForwardBlock(rule) })
        prior = next
      }
    }
    return executeTaskSteps(steps)
  },
  verify: async (input, before, result) => {
    const actual = await accessSnapshot()
    return configVerification(result, same(actual, accessProject(input, before, action)), actual,
      'The exact service rule and device scope are configured and read back. Other rules can affect connectivity; address changes require rechecking this rule.')
  }
}))

const guestSnapshot = async (input, context = {}) => {
  const all = await devices(), guests = input.guests ? selectDevices(all, input.guests) : all.filter(d => policies(d).includes('guestonly'))
  const protectedDevices = selectDevices(all, input.protectedDevices)
  need(!protectedDevices.some(p => guests.some(g => deviceId(g) === deviceId(p))), 'A device cannot be both guest and protected')
  const firewall = await firewallAPI.config(), groups = rows(await groupAPI.list(), 'Groups')
  const pfw = context.isPlusDisabled === true ? null : await pfwAPI.config()
  return { all, guests, protectedDevices, firewall, groups, pfw, plusDisabled: context.isPlusDisabled === true }
}
const guestAssessment = state => {
  const { guests, protectedDevices, groups, firewall, pfw } = state
  const exceptions = [], unresolved = []
  const endpoints = rows(firewall.Endpoints, 'Service endpoints')
  const custom = rows(firewall.CustomInterfaceRules, 'Custom interface rules')
  const forwards = rows(firewall.ForwardingRules, 'Forwarding rules')
  if (custom.length) unresolved.push('Custom interface rules require scope inspection')
  if (pfw && ['GroupRules', 'TagRules', 'ForwardingRules'].some(k => rows(pfw[k], k).some(r => !r.Disabled))) unresolved.push('Dynamic PFW grants/routes require scope inspection')
  for (const guest of guests) {
    if (policies(guest).includes('lan')) exceptions.push({ device: deviceId(guest), type: 'broad_lan_policy' })
    for (const name of rows(guest.Groups, 'Guest groups')) {
      const definitions = groups.filter(g => g.Name === name)
      if (definitions.length > 1) { unresolved.push(`Duplicate group ${name}`); continue }
      if (definitions[0]?.Disabled) continue
      if (rows(definitions[0]?.ServiceDestinations ?? null, 'Service destinations').length) { unresolved.push(`Service group ${name} requires inspection`); continue }
      if (protectedDevices.some(p => rows(p.Groups, 'Protected groups').includes(name))) exceptions.push({ device: deviceId(guest), type: 'shared_group', group: name })
    }
    for (const rule of endpoints) if (rows(rule.Tags, 'Endpoint tags').some(tag => tags(guest).includes(tag))) {
      if (rule.Domain || rule.IP?.includes('/')) { unresolved.push(`Endpoint ${rule.RuleName} needs address-scope inspection`); continue }
      if (protectedDevices.some(p => p.RecentIP === rule.IP)) exceptions.push({ device: deviceId(guest), type: 'endpoint', rule: rule.RuleName })
    }
  }
  if (!guests.length) unresolved.push('No matching guest devices were observed; no current guest path was checked')
  return { defaultProtection: true, exceptions, unresolved, connectivityTested: false }
}
const guestInspect = {
  ...common('tasks.guests.inspect', 'Check guest access to private devices',
    'SPR isolates guests by default. Inspect exact protected devices for custom guest grants before proposing any change. guests may be omitted to select devices with the system guestonly policy. Missing plugin evidence is unknown, not proof of isolation.',
    object({ guests: deviceRefs(), protectedDevices: deviceRefs() }, ['protectedDevices']), ['Network > Wifi', 'Firewall > Firewall']),
  kind: 'read', relatedDomains: ['network', 'firewall', 'devices'], terminalResponse: true,
  run: async (input, context) => {
    const state = await guestSnapshot(input, context), assessment = guestAssessment(state)
    const summary = assessment.unresolved.length ? 'SPR isolates guests by default. Some custom rules or missing guest observations need inspection before this setup can be confirmed.'
      : assessment.exceptions.length ? 'SPR isolates guests by default, but custom permissions may allow access to the selected private devices. A narrow protection change can preserve other household access.'
        : 'SPR isolates guests by default. No custom access exceptions to the selected private devices were found in the inspected configuration. No changes were made; live traffic was not tested.'
    return { message: summary, receipt: taskReceipt(assessment.unresolved.length ? 'incomplete' : assessment.exceptions.length ? 'needs_review' : 'no_change', summary, { applied: false }), assessment }
  }
}
const guestProtect = {
  ...common('tasks.guests.protect', 'Maintain guest isolation for private devices',
    'Check default guest isolation first. If no custom exceptions are found, make no change. When exceptions exist, add exact all-protocol PFW blocks from each selected guest identity to each protected IP; preserve household grants and printer access to other devices. Requires available PLUS/PFW for a corrective block. Unresolved dynamic/custom routes prevent automatic correction.', guestInspect.schema, guestInspect.menus),
  relatedDomains: guestInspect.relatedDomains, snapshot: guestSnapshot,
  project: (input, before, context) => {
    const assessment = guestAssessment(before)
    need(!assessment.unresolved.length, assessment.unresolved.join('; '))
    if (!assessment.exceptions.length) return before
    need(!before.plusDisabled && before.pfw, 'Corrective all-protocol protection requires the PFW plugin')
    const blockRules = [...rows(before.pfw.BlockRules, 'PFW block rules')]
    for (const guest of before.guests) for (const target of before.protectedDevices) {
      const destination = uniqueIP(before.all, target)
      const existing = blockRules.filter(r => !r.Disabled && r.Client?.Identity === deviceId(guest) &&
        r.Dst?.IP === destination && !r.Dst?.Domain && !r.Protocol && ['', '0-65535'].includes(r.DstPort) && !r.Condition &&
        !r.Time?.CronExpr && !r.Time?.Start && !r.Time?.End && rows(r.Time?.Days, 'Block schedule').every(day => day === 0) && !r.Expiration)
      if (existing.length) continue
      const name = `Guest protection ${stamp(`${deviceId(guest)}|${deviceId(target)}`)}`
      need(!blockRules.some(r => r.RuleName === name), 'A conflicting guest protection rule already exists')
      blockRules.push({ RuleName: name, Disabled: false, Expiration: 0,
        Time: { Days: [0, 0, 0, 0, 0, 0, 0], Start: '', End: '', CronExpr: '' }, Condition: '',
        Client: { Identity: deviceId(guest), SrcIP: '', Group: '', Tag: '' }, Protocol: '',
        Dst: { IP: destination, Domain: '' }, DstPort: '0-65535' })
    }
    return { ...before, pfw: { ...before.pfw, BlockRules: blockRules } }
  },
  noChangeSummary: 'Guest isolation is the SPR default. The inspected configuration needs no additional protection rule for these devices. No changes were sent; live traffic was not tested.',
  redact: state => state?.all ? { guests: state.guests, protectedDevices: state.protectedDevices, assessment: guestAssessment(state), blocks: state.pfw?.BlockRules } : state,
  run: async (input, context) => {
    let prior = rows(context.before.pfw?.BlockRules, 'PFW blocks')
    const steps = []
    for (const rule of context.after.pfw.BlockRules.filter(r => !prior.some(old => same(old, r)))) {
      const next = [...prior, rule]
      steps.push({ label: rule.RuleName, before: prior, after: next, read: async () => rows((await pfwAPI.config()).BlockRules, 'PFW blocks'), write: () => pfwAPI.addBlock(rule) })
      prior = next
    }
    return executeTaskSteps(steps)
  },
  verify: async (input, before, result, context) => {
    const after = await guestSnapshot(input, context), wanted = guestProtect.project(input, before, context)
    return configVerification(result, same(after, wanted), { blocks: after.pfw?.BlockRules },
      'Exact guest-to-private-device blocking rules are configured and read back. Other household permissions were preserved. Live traffic has not been tested; recheck if protected addresses change.')
  }
}

const diagnostics = {
  ...common('tasks.network.diagnose', 'Inspect Internet, DNS, VPN or uplink trouble',
    'Read available health/configuration evidence without making changes. Then answer from the returned checks, naming the relevant findings and next step. Configuration alone does not prove connectivity. Use symptom plus optional exact devices.',
    object({ symptom: enumValue(['internet', 'dns', 'vpn', 'uplink']), devices: deviceRefs() }, ['symptom']), ['Network > Internet Health']),
  kind: 'read', relatedDomains: ['network', 'dns'],
  run: async input => {
    const checks = {}, jobs = { interfaces: () => wifiAPI.interfacesConfiguration(), addresses: () => wifiAPI.ipAddr(), internetHealth: async () => {
      const [status, config] = await Promise.all([wanAPI.status(), wanAPI.config().catch(() => null)])
      if (config?.Enabled === true) return { monitoringEnabled: true, uplinks: status }
      return { monitoringEnabled: config ? false : null, note: 'WAN health monitoring is off or unknown, so health is not measured.',
        uplinks: Array.isArray(status) ? status.map(u => ({ Iface: u?.Iface })) : null }
    } }
    if (input.symptom === 'dns') jobs.dnsFiltering = () => blockAPI.config()
    if (input.symptom === 'vpn') {
      jobs.vpnListener = () => wireguardAPI.status()
      jobs.vpnPeers = () => wireguardAPI.peers()
    }
    if (input.devices) jobs.devices = async () => selectDevices(await devices(), input.devices)
    for (const [name, get] of Object.entries(jobs)) {
      try { checks[name] = { status: 'observed', data: await get() } }
      catch { checks[name] = { status: 'unavailable' } }
    }
    const unavailable = Object.values(checks).filter(c => c.status === 'unavailable').length
    return { symptom: input.symptom, checks, incomplete: unavailable > 0 }
  }
}

export const createPriorityTasks = base => {
  const available = new Set(base.map(s => s.id))
  return [
    [familySetup, 'devices.personas.update'], [adsDevices, 'dns.blocklist.put'],
    ...accessTasks.map(s => [s, 'firewall.endpoint.add']),
    [guestInspect, 'network.groups.read'], [diagnostics, 'network.wan.status']
  ].filter(([, dependency]) => available.has(dependency)).map(([spec]) => spec)
}
