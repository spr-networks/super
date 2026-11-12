import { array, enumValue, integer, object, string, validateInput } from './operationSchema'
import { DEFAULT_AD_BLOCKLIST_URI } from '../DNS/blocklistPresets'
import { matchRef } from './taskRuntime'

const requireState = (condition, message) => { if (!condition) throw new Error(message) }
const copy = value => JSON.parse(JSON.stringify(value))
const reference = () => string({ minLength: 1, maxLength: 2048,
  description: 'Exact device name, MAC or WireGuard public key from the user or current evidence. Code resolves it; never guess an identity.' })
const references = () => array(reference(), { minItems: 1, maxItems: 64, uniqueItems: true })
const names = () => array(string({ minLength: 1, maxLength: 256 }), { maxItems: 64, uniqueItems: true })
const personaReference = () => string({ minLength: 1, maxLength: 256, description: 'Exact existing persona name or persona: tag. Ask which child/persona if unspecified.' })
const identity = device => device.MAC || device.WGPubKey
const memberArray = (value, label) => {
  requireState(value === null || (Array.isArray(value) && value.every(v => typeof v === 'string')), `${label} unavailable; refresh before preparing a change`)
  return value || []
}
const one = (items, matches, label) => {
  requireState(Array.isArray(items), `${label} inventory unavailable`)
  const found = items.filter(matches)
  requireState(found.length === 1, `Expected one exact ${label}; found ${found.length}. Ask for an exact name or identity; no change was prepared.`)
  return found[0]
}
const resolveDevice = (devices, ref) => {
  requireState(Array.isArray(devices), 'device inventory unavailable')
  const exact = d => d.Name === ref || d.WGPubKey === ref ||
    (typeof d.MAC === 'string' && d.MAC.toLowerCase() === ref.toLowerCase())
  const folded = d => typeof d.Name === 'string' && d.Name.trim().toLowerCase() === ref.trim().toLowerCase()
  const device = one(devices, devices.some(exact) ? exact : folded, 'device')
  requireState(typeof identity(device) === 'string' && identity(device).length > 0, 'Device has no usable identity')
  return device
}
const resolvePersona = (data, ref) => { const hits = matchRef(data?.personas, ref, ['Name', 'Tag']); return one(data?.personas, p => hits.includes(p), 'family persona') }
const foldName = name => name.trim().toLowerCase()
const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const hhmm = () => string({ pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' })

export const createTaskOperations = (baseOperations) => {
  const resolvedGroups = new WeakMap()
  const base = new Map(baseOperations.map(spec => [spec.id, spec]))
  const read = async (id, context) => {
    const spec = base.get(id)
    requireState(spec?.kind === 'read', `Missing read operation: ${id}`)
    return spec.run({}, context)
  }
  const compiled = ({ id, label, description, schema, dependencies, compile, complete, check, noChangeSummary, menus = ['Devices'] }) => ({
    id, label, description, schema, domain: 'tasks', kind: 'write', task: true, menus,
    relatedDomains: [...new Set(dependencies.map(id => base.get(id).domain))],
    sources: ['frontend/src/components/Assistant/taskOperations.js', ...dependencies.flatMap(id => base.get(id).sources || [])],
    snapshot: async (input, context = {}) => {
      validateInput(input, schema)
      const action = await compile(input, context)
      const spec = base.get(action.operationId)
      requireState(dependencies.includes(action.operationId) && spec?.kind === 'write', 'Task compiled an unsupported operation')
      validateInput(action.input, spec.schema)
      const state = await spec.snapshot(copy(action.input), context)
      if (complete) action.input = complete(input, action.input, state)
      validateInput(action.input, spec.schema)
      if (check) check(input, state)
      return { action, state }
    },
    project: (input, before, context = {}) => ({ action: before.action,
      state: base.get(before.action.operationId).project(copy(before.action.input), copy(before.state), context) }),
    noChangeSummary,
    redact: value => value?.action && Object.prototype.hasOwnProperty.call(value, 'state') ? value.state : value,
    run: (input, context) => {
      const { action, state } = context.before
      return base.get(action.operationId).run(copy(action.input), { ...context, before: copy(state), after: copy(context.after.state) })
    },
    verify: (input, before, result, context) => {
      const spec = base.get(before.action.operationId)
      return spec.verify ? spec.verify(copy(before.action.input), copy(before.state), result, context)
        : { verified: null, summary: 'Request accepted; its final effect has not been verified.' }
    }
  })
  const definitions = [
    {
      id: 'tasks.firewall.port_forward', label: 'Forward an external port to an internal address', menus: ['Firewall > Firewall'],
      description: 'Prepare a reviewed TCP or UDP port forward. Require explicit protocol, external port, destination IP/port and source IP/CIDR. Ask for missing choices; do not invent all-source scope. Use 0.0.0.0/0 only if any IPv4 source is requested. No rule is applied until accepted.',
      schema: object({ protocol: enumValue(['tcp', 'udp']), externalPort: integer({ minimum: 1, maximum: 65535 }),
        destination: string({ minLength: 2, maxLength: 64 }), destinationPort: integer({ minimum: 1, maximum: 65535 }),
        source: string({ minLength: 2, maxLength: 64 }) }, ['protocol', 'externalPort', 'destination', 'destinationPort', 'source']),
      dependencies: ['firewall.port_forward.add'],
      compile: async input => ({ operationId: 'firewall.port_forward.add', input: { rule: {
        Protocol: input.protocol, SrcIP: input.source, SrcPort: String(input.externalPort),
        DstIP: input.destination, DstPort: String(input.destinationPort)
      } } })
    },
    {
      id: 'tasks.devices.internet', label: 'Set Internet access for selected devices',
      description: 'Prefer this task for allow/block Internet or DNS-only access. Supply exact device names; code resolves identities and preserves other policies, groups and tags. allow adds wan; block removes wan and preserves DNS; dns_only removes wan and adds dns only when explicitly requested. An allowlist policy (restricted internet) is removed in every mode. A disabled or quarantined device cannot be allowed. Other firewall rules and a persona limit can still restrict access.',
      schema: object({ devices: references(), mode: enumValue(['allow', 'block', 'dns_only']) }, ['devices', 'mode']),
      dependencies: ['devices.list', 'devices.bulk_policies'],
      compile: async (input, context) => {
        const all = await read('devices.list', context)
        const selected = input.devices.map(ref => resolveDevice(all, ref))
        const identities = selected.map(identity)
        requireState(new Set(identities.map((id, i) => selected[i].MAC ? id.toLowerCase() : id)).size === identities.length, 'The same device was selected more than once')
        const off = selected.find(d => (d.Policies || []).includes('disabled') || (d.Policies || []).includes('quarantine'))
        requireState(input.mode !== 'allow' || !off, `${off?.Name || 'A selected device'} is disabled or quarantined; allowing internet would have no effect until that is lifted on the Devices page.`)
        const allowlists = [...new Set(selected.flatMap(d => (d.Policies || []).filter(p => typeof p === 'string' && p.startsWith('allowlist:'))))]
        return { operationId: 'devices.bulk_policies', input: { identities,
          add: input.mode === 'allow' ? ['wan'] : input.mode === 'dns_only' ? ['dns'] : [],
          remove: input.mode === 'allow' ? allowlists : ['wan', ...allowlists] } }
      },
      check: (input, state) => state.forEach(d => memberArray(d.Policies, 'Device policies')),
      noChangeSummary: 'The selected devices already have the requested WAN/DNS policy settings. No changes were sent. Other rules and connectivity have not been tested.'
    },
    {
      id: 'tasks.devices.rename', label: 'Rename a selected device',
      description: 'Rename a device by its exact current name or identity. Code resolves its identity and changes only Name.',
      schema: object({ device: reference(), name: string({ minLength: 1, maxLength: 256 }) }, ['device', 'name']),
      dependencies: ['devices.list', 'devices.update'],
      compile: async (input, context) => ({ operationId: 'devices.update', input: {
        identity: identity(resolveDevice(await read('devices.list', context), input.device)), changes: { Name: input.name } } }),
      noChangeSummary: 'The selected device already has that name. No changes were sent.'
    },
    {
      id: 'tasks.devices.membership', label: 'Change the groups of one device: add it to a group or remove it from a group',
      description: 'Change only the explicitly requested groups on one named device while preserving its other groups, policies and tags. device is the device; add and remove are group names. A group to add must already exist; code matches its name and never creates a group. Devices in the same group can reach each other.',
      schema: object({ device: reference(),
        add: array(string({ minLength: 1, maxLength: 256 }), { maxItems: 64, uniqueItems: true, description: 'Names of the existing groups to put the device in. Group names only, never the device name. Use [] when nothing is added.' }),
        remove: array(string({ minLength: 1, maxLength: 256 }), { maxItems: 64, uniqueItems: true, description: 'Names of the groups to take the device out of. Use [] when nothing is removed.' }) }, ['device', 'add', 'remove']),
      dependencies: ['devices.list', 'network.groups.read', 'devices.update'],
      compile: async (given, context) => {
        requireState(given.add.length + given.remove.length > 0, 'Specify a group to add or remove')
        const groups = await read('network.groups.read', context)
        requireState(Array.isArray(groups), 'Group list unavailable; refresh before preparing a change')
        const devices = await read('devices.list', context)
        requireState(Array.isArray(devices), 'device inventory unavailable')
        const fold = name => name.trim().toLowerCase()
        const bare = name => fold(name).replace(/^the\s+/, '').replace(/\s+group$/, '')
        const groupNamed = name => {
          const same = groups.filter(g => g.Name === name); if (same.length) return same
          const folded = groups.filter(g => typeof g.Name === 'string' && fold(g.Name) === fold(name)); if (folded.length) return folded
          return groups.filter(g => typeof g.Name === 'string' && fold(g.Name) === bare(name))
        }
        const isGroup = name => groupNamed(name).length > 0
        const isDevice = name => devices.some(d => d.WGPubKey === name || [d.Name, d.MAC].some(v => typeof v === 'string' && fold(v) === fold(name)))
        let input = given
        const only = given.add.length + given.remove.length === 1 ? (given.add[0] ?? given.remove[0]) : null
        if (only !== null && !isDevice(given.device) && isGroup(given.device) && isDevice(only) && !isGroup(only))
          input = { device: only, add: given.add.length ? [given.device] : [], remove: given.remove.length ? [given.device] : [] }
        const add = input.add.map(name => {
          const match = groupNamed(name)
          requireState(match.length === 1, `No single existing group is named "${name}"${isDevice(name) ? ' (that is a device name; put it in device and the group in add or remove)' : ''}. Existing groups: ${groups.map(g => g.Name).filter(Boolean).slice(0, 20).join(', ') || 'none'}. Ask which group; no change was prepared.`)
          requireState(!match[0].Disabled && !match[0].ServiceDestinations?.length, `"${match[0].Name}" is not an enabled ordinary group`)
          return match[0].Name
        })
        requireState(!add.some(name => input.remove.some(r => fold(r) === fold(name))), 'A group cannot be both added and removed')
        const device = resolveDevice(devices, input.device)
        const actionInput = { identity: identity(device), changes: {} }
        resolvedGroups.set(actionInput, { add, remove: input.remove })
        return { operationId: 'devices.update', input: actionInput }
      },
      complete: (_input, actionInput, state) => {
        const current = memberArray(state.Groups, 'Device groups')
        const { add = [], remove = [] } = resolvedGroups.get(actionInput) || {}
        const action = actionInput
        const strip = name => name.trim().toLowerCase().replace(/^the\s+/, '').replace(/\s+group$/, '')
        const removed = remove.map(name => current.find(g => g === name) || current.find(g => g.toLowerCase() === name.trim().toLowerCase()) || current.find(g => g.toLowerCase() === strip(name)) || name)
        return { ...action, changes: { Groups: [...new Set([...current.filter(g => !removed.includes(g)), ...add])] } }
      },
      check: (input, state) => memberArray(state.Groups, 'Device groups'),
      noChangeSummary: ({ state }) => `${state?.Name || state?.MAC || 'The selected device'} already has the requested group membership. Its groups: ${Array.isArray(state?.Groups) && state.Groups.length ? state.Groups.join(', ') : 'none'}. No changes were sent.`
    },
    {
      id: 'tasks.devices.tags', label: 'Add or remove device tags',
      description: 'Change only explicitly requested ordinary tags on one named device while preserving unrelated tags, policies and groups. Tags are saved lowercase. Tags can affect DNS filtering and tag-scoped service endpoints; do not invent tags to solve an access task. The guest tag marks a device for automatic disabling after 30 days without a DHCP lease, so say so when adding or removing it. Persona membership changes require the persona controls.',
      schema: object({ device: reference(), add: names(), remove: names() }, ['device', 'add', 'remove']),
      dependencies: ['devices.list', 'devices.update'],
      compile: async (input, context) => {
        requireState(input.add.length + input.remove.length > 0, 'Specify tags to add or remove')
        requireState(!input.add.some(tag => input.remove.some(r => foldName(r) === foldName(tag))), 'A tag cannot be both added and removed')
        requireState(![...input.add, ...input.remove].some(tag => tag.startsWith('persona:')), 'Use the family/persona membership controls for persona tags')
        const device = resolveDevice(await read('devices.list', context), input.device)
        return { operationId: 'devices.update', input: { identity: identity(device), changes: {} } }
      },
      complete: (input, actionInput, state) => {
        const current = memberArray(state.DeviceTags, 'Device tags')
        const known = tag => current.find(t => t === tag) || current.find(t => foldName(t) === foldName(tag)) || tag
        const removed = input.remove.map(known)
        const added = input.add.map(tag => known(tag)).map(tag => current.includes(tag) ? tag : tag.trim().toLowerCase())
        const POLICY_NAMES = ['wan', 'lan', 'dns', 'api', 'lan_upstream', 'noapi', 'guestonly', 'disabled', 'quarantine', 'dns:family', 'dns_passthru']
        const clash = added.find(tag => POLICY_NAMES.includes(tag) || tag.startsWith('allowlist:'))
        requireState(!clash, `${clash} is a policy name and cannot be used as a tag`)
        requireState(added.every(Boolean), 'A tag cannot be empty')
        return { ...actionInput, changes: { DeviceTags: [...new Set([...current.filter(tag => !removed.includes(tag)), ...added])] } }
      },
      check: (input, state) => memberArray(state.DeviceTags, 'Device tags'),
      noChangeSummary: 'The selected device already has the requested tags. No changes were sent.'
    },
    {
      id: 'tasks.family.limits', label: 'Set the Internet time limits of a persona',
      description: 'Set limits for an existing named family persona and enable its controls. Supply dailyMinutes and/or blockedDuring; omitted settings are preserved. blockedDuring REPLACES blocked windows, [] clears them. Use short day names and HH:MM in router local time; overnight windows start on the named days. 0 dailyMinutes removes the daily cap. Counts active Internet minutes across all persona devices, resets at 06:00; not screen time. If no persona exists, use family setup first.',
      schema: object({ persona: personaReference(), dailyMinutes: integer({ minimum: 0, maximum: 1440 }),
        blockedDuring: array(object({ days: array(enumValue(dayNames), { minItems: 1, maxItems: 7, uniqueItems: true }),
          start: hhmm(), end: hhmm() }, ['days', 'start', 'end']), { maxItems: 32 }) }, ['persona']),
      dependencies: ['devices.personas.read', 'devices.personas.update'],
      compile: async (input, context) => {
        requireState(input.dailyMinutes !== undefined || input.blockedDuring !== undefined, 'Ask for a daily limit or blocked times; do not invent a child’s schedule')
        const persona = resolvePersona(await read('devices.personas.read', context), input.persona)
        const changes = { Disabled: false }
        if (input.dailyMinutes !== undefined) changes.DailyLimitMinutes = input.dailyMinutes
        if (input.blockedDuring !== undefined) changes.Schedules = input.blockedDuring.map(window => {
          requireState(window.start !== window.end, 'Equal start/end blocks no time; ask for the intended window')
          return { Days: dayNames.map(day => window.days.includes(day) ? 1 : 0), Start: window.start, End: window.end }
        })
        return { operationId: 'devices.personas.update', input: { Tag: persona.Tag, changes } }
      },
      noChangeSummary: 'Those family limits are already configured and enabled. No changes were sent. Temporary grants and current connectivity have not been checked.'
    },
    {
      id: 'tasks.family.pause', label: 'Pause the Internet of a persona temporarily',
      description: 'Pause an existing named family persona for the requested number of minutes. Code resolves its tag; keeps daily limits, schedules and membership.',
      schema: object({ persona: personaReference(), minutes: integer({ minimum: 1, maximum: 10080 }) }, ['persona', 'minutes']),
      dependencies: ['devices.personas.read', 'devices.list', 'devices.personas.pause'],
      compile: async (input, context) => {
        const persona = resolvePersona(await read('devices.personas.read', context), input.persona)
        requireState(persona.Disabled !== true, `The controls of ${persona.Name} are switched off, so a pause would have no effect. Set its limits first to switch them on.`)
        let listed = null
        try { listed = await read('devices.list', context) } catch (error) { listed = null }
        requireState(!Array.isArray(listed) || listed.some(d => Array.isArray(d.DeviceTags) && d.DeviceTags.includes(persona.Tag)), `${persona.Name} has no devices, so a pause would have no effect. Add devices to the persona first.`)
        const grantUntil = Number((await read('devices.personas.read', context))?.usage?.[persona.Tag]?.GrantUntil || 0)
        requireState(!(grantUntil * 1000 > Date.now()), `${persona.Name} has an active time extension, which overrides a pause until it ends.`)
        return { operationId: 'devices.personas.pause', input: { Tag: persona.Tag, Minutes: input.minutes } }
      }
    },
    {
      id: 'tasks.ads.enable', label: 'Enable DNS ad blocking', menus: ['DNS > Blocklists/Ad-Block'],
      description: 'Enable the default DNS ad/malware list. Use scope all only when the user explicitly requests every device; this removes an existing tag restriction under review. With scope omitted, preserve an existing global list and ask before expanding a scoped one. Other lists and overrides are preserved. DNS filtering cannot remove every ad.',
      schema: object({ scope: enumValue(['all']) }), dependencies: ['dns.blocklist.put'],
      compile: async input => ({ operationId: 'dns.blocklist.put', input: { URI: DEFAULT_AD_BLOCKLIST_URI, Enabled: true, DontBlock: false, ...(input.scope === 'all' ? { Tags: [] } : {}) } }),
      check: (input, state) => {
        const existing = state.filter(row => row.URI === DEFAULT_AD_BLOCKLIST_URI)
        requireState(existing.length <= 1, 'Duplicate default ad list; resolve the list identity first')
        if (existing.length) requireState(input.scope === 'all' || memberArray(existing[0].Tags, 'Ad list scope').length === 0,
          'The default ad list has a custom tag scope. Ask which devices to cover; this task will not broaden that scope.')
      },
      noChangeSummary: 'The default DNS ad list is already enabled in blocking mode. No changes were sent. List loading and actual DNS filtering have not been verified.'
    }
  ]
  return definitions.filter(task => task.dependencies.every(id => base.has(id))).map(compiled)
}
