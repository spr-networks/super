import { UI_OPERATIONS, availableInTaskMode, getUIOperation, readUIOperation } from './assistantOperations'
import { MODEL_TASK_NAMES } from './modelNames'
import { explanations, matchDevices } from './taskRuntime'

const PREFIX = { show: 'tasks.show.', change: 'tasks.change.', setup: 'tasks.setup.' }
const DEVICE_FIELDS = new Set(['device', 'devices', 'sources', 'destination', 'guests', 'protectedDevices'])
const NUMERIC = ['integer', 'number']
const SENTENCE_WORDS = new Set(['the', 'my', 'a', 'an', 'please', 'and', 'for', 'in', 'on', 'of', 'is', 'are', 'it', 'me', 'all', 'every', 'using', 'with', 'until', 'tonight', 'now'])

const lookup = (id) => { try { return getUIOperation(id) } catch (error) { return null } }

export const PAGES = Object.freeze({
  home: '/admin/home', devices: '/admin/devices', assistant: '/admin/assistant', topology: '/admin/topology', wifi: '/admin/wireless',
  vpn: '/admin/wireguard', dhcp: '/admin/supernets', uplink: '/admin/uplink', wan: '/admin/wan', mesh: '/admin/mesh', signal: '/admin/signal/strength',
  traffic: '/admin/traffic', bandwidth: '/admin/traffic/summary', timeseries: '/admin/timeseries', insights: '/admin/traffic_insights',
  firewall: '/admin/firewall', services: '/admin/firewallSettings', pfw: '/admin/pfw', dns: '/admin/dnsBlock', hostnames: '/admin/dnsHostnames',
  'dns-log': '/admin/dnsLog/:ips/:text', 'dns-log-settings': '/admin/dnsLogEdit', dyndns: '/admin/dyndns', 'dns-settings': '/admin/dns',
  alerts: '/admin/alerts', events: '/admin/events', notifications: '/admin/notifications', tasks: '/admin/pfw_tasks',
  info: '/admin/info', plugins: '/admin/plugins', flags: '/admin/feature_flags', auth: '/admin/auth/'
})

const SETUP_PAGES = Object.freeze({
  'tasks.uplink.pppoe': ['/admin/uplink', 'Link Settings', 'Add the PPPoE uplink there.'],
  'tasks.uplink.wireless': ['/admin/uplink', 'Link Settings', 'Choose the uplink interface and join the WiFi network there.'],
  'tasks.dyndns.setup': ['/admin/dyndns', 'Dynamic DNS', 'Enter the provider and domain there.'],
  'tasks.vpn.setup': ['/admin/wireguard', 'VPN', 'Add the VPN client there.'],
  'tasks.vpn.site': ['/admin/wireguard', 'VPN', 'Add the site VPN there.']
})
const PAGE_TITLES = Object.freeze({ '/admin/wireless': 'Wifi', '/admin/wireguard': 'VPN', '/admin/uplink': 'Link Settings', '/admin/mesh': 'MESH', '/admin/devices': 'Devices',
  '/admin/dyndns': 'Dynamic DNS', '/admin/auth': 'Auth', '/auth/validate': 'the sign-in check' })
export const setupPage = (id) => {
  if (SETUP_PAGES[id]) { const [route, title, hint] = SETUP_PAGES[id]; return { route, title, hint } }
  const spec = lookup(id)
  return spec?.kind === 'ui' && spec.route && spec.route !== '/admin/assistant' ? { route: spec.route, title: PAGE_TITLES[spec.route] || spec.route, hint: `${spec.label}.` } : null
}

const HISTORY_LIMIT = 200
export const cliHistory = []
export const rememberLine = (line) => {
  if (cliHistory[cliHistory.length - 1] !== line) cliHistory.push(line)
  if (cliHistory.length > HISTORY_LIMIT) cliHistory.shift()
}
// !! is the previous line, !$ its last word, !N line N of `history`.
export const expandHistory = (line, history = cliHistory) => {
  if (!/!(!|\$|\d+)/.test(line)) return line
  const previous = history[history.length - 1]
  return line.replace(/!(!|\$|\d+)/g, (whole, what) => {
    if (what === '!') return previous ?? whole
    if (what === '$') return previous ? tokenize(previous).pop() : whole
    return history[Number(what) - 1] ?? whole
  })
}

const TYPED_NAMES = Object.freeze({ 'tasks.family.setup': 'personas' })
const NOT_COMMANDS = new Set(['tasks.guests.inspect'])

const describeField = (name, schema, required) => {
  const type = schema?.enum ? schema.enum.join('|') : schema?.type === 'array' ? `${schema.items?.enum ? schema.items.enum.join('|') : schema.items?.type || 'value'},…` : schema?.type || 'value'
  return { name, required, type, text: schema?.description || '' }
}
const usageOf = (fields) => fields.map(f => f.required ? `<${f.name}>` : `[${f.name}=…]`).join(' ')

export const cliCommands = () => Object.entries(MODEL_TASK_NAMES).flatMap(([id, modelName]) => {
  const verb = Object.keys(PREFIX).find(v => modelName.startsWith(PREFIX[v]))
  const spec = verb && lookup(id)
  if (!spec || spec.internal || NOT_COMMANDS.has(id)) return []
  const properties = spec.schema?.properties || {}, required = spec.schema?.required || []
  const fields = [...required.filter(f => f in properties), ...Object.keys(properties).filter(f => !required.includes(f))]
    .map(f => describeField(f, properties[f], required.includes(f)))
  return [{ verb, name: TYPED_NAMES[id] || modelName.slice(PREFIX[verb].length), id, kind: spec.kind, label: spec.label, description: spec.description || '', schema: spec.schema, fields, usage: usageOf(fields) }]
}).sort((a, b) => a.verb.localeCompare(b.verb) || a.name.localeCompare(b.name))

export const cliReadOperations = () => UI_OPERATIONS
  .filter(s => s.kind === 'read' && !s.task && !s.internal && availableInTaskMode(s))
  .map(s => ({ id: s.id, label: s.label, schema: s.schema }))
  .sort((a, b) => a.id.localeCompare(b.id))

export const cliDoOperations = () => UI_OPERATIONS
  .filter(s => (s.kind === 'write' || s.kind === 'ui') && !s.task && !s.internal && availableInTaskMode(s))
  .map(s => ({ id: s.id, label: s.label, schema: s.schema, kind: s.kind }))
  .sort((a, b) => a.id.localeCompare(b.id))

const READINGS = Object.freeze({
  wifi: ['network.wifi.status', 'state of one access-point radio', '<iface>'], stations: ['network.mesh.stations', 'WiFi clients connected right now'],
  mesh: ['network.mesh.leaves', 'mesh nodes'], dhcp: ['network.dhcp.connected', 'devices with a current address'],
  interfaces: ['network.interfaces.read', 'network interfaces'], topology: ['network.topology.read', 'how devices connect'],
  wan: ['network.wan.status', 'uplink status in detail'], outages: ['network.wan.outages', 'recorded internet outages'],
  speed: ['network.wan.speed.results', 'saved speed test results'], firewall: ['firewall.config', 'firewall rules and services'],
  dns: ['dns.settings.read', 'DNS settings'], blocklists: ['dns.block.read', 'DNS block lists and overrides'], hostnames: ['dns.hostnames.read', 'local hostnames'],
  dyndns: ['dns.dyndns.read', 'dynamic DNS configuration'], notifications: ['monitor.notifications.read', 'notification settings'],
  buckets: ['monitor.events.buckets', 'event log buckets'], system: ['system.info.read', 'version, uptime and hardware'],
  services: ['system.services.status', 'state of one router service', '<dns|dhcp|wifid|mesh>'], containers: ['system.containers.read', 'running containers'],
  backups: ['system.backups.read', 'saved backups'], flags: ['system.flags.read', 'feature flags'], personas: ['devices.personas.read', 'personas and their limits']
})

const EVERYDAY = Object.freeze({
  devices: { usage: 'devices [group=…|policy=…|tag=…]', text: 'count and list devices', to: w => ['show', 'device_count', ...w] },
  alerts: { usage: 'alerts', text: 'alerts that fired', to: () => ['show', 'alert_events'] },
  rules: { usage: 'rules', text: 'saved alert rules', to: () => ['show', 'alert_rules'] },
  uplinks: { usage: 'uplinks', text: 'internet uplink health', to: () => ['show', 'uplink_health'] },
  plugins: { usage: 'plugins', text: 'enabled and disabled plugins', to: () => ['show', 'plugins'] },
  forwards: { usage: 'forwards', text: 'saved port forwards', to: () => ['show', 'port_forwards'] },
  vpn: { usage: 'vpn', text: 'WireGuard peers and handshakes', to: () => ['show', 'vpn_peers'] },
  groups: { usage: 'groups <device>', text: 'groups of one device', to: w => ['show', 'device_groups', ...w] },
  signal: { usage: 'signal <device>', text: 'WiFi signal and channel of one device', to: w => ['show', 'wifi_signal', ...w] },
  traffic: { usage: 'traffic [minutes] [device]', text: 'traffic totals (default: last 60 minutes)', to: w => ['show', 'traffic_totals', ...(/^\d+$/.test(w[0] || '') ? w : ['60', ...w])] },
  diagnose: { usage: 'diagnose <symptom> [devices…]', text: 'check internet, dns, vpn or uplink trouble', to: w => ['show', 'network_diagnosis', ...w] },
  log: { usage: 'log <bucket> [minutes]', text: 'recent events of one event bucket',
    to: w => ['show', 'event_log', `bucket=${w[0] || ''}`, ...(w[1] ? [`lastMinutes=${w[1]}`] : []), 'filters=[]', 'match=all', 'mode=read', ...w.slice(2)] },
  ...Object.fromEntries(Object.entries(READINGS).map(([name, [id, text, args]]) => [name, { usage: args ? `${name} ${args}` : name, text, reading: true, to: w => ['read', id, ...w] }])),
  'dns-blocks': { usage: 'dns-blocks [device] [minutes]', text: 'recent blocked lookups, for all or one device' },
  explain: { usage: `explain <${Object.keys(explanations).join('|')}>`, text: 'how an SPR feature works (not a live reading)' },
  block: { usage: 'block <device…>', text: 'block internet access', change: true, to: w => ['change', 'internet_access', `devices=${list(w)}`, 'mode=block'] },
  allow: { usage: 'allow <device…>', text: 'allow internet access', change: true, to: w => ['change', 'internet_access', `devices=${list(w)}`, 'mode=allow'] },
  'dns-only': { usage: 'dns-only <device…>', text: 'allow DNS but not internet', change: true, to: w => ['change', 'internet_access', `devices=${list(w)}`, 'mode=dns_only'] },
  rename: { usage: 'rename <device> <new name>', text: 'rename a device', change: true, to: w => ['change', 'device_name', w[0] ?? '', w.slice(1).join(' ')].filter((x, i) => i < 3 || x) },
  group: { usage: 'group add|remove <device> <group…>', text: 'change the groups of a device', change: true, to: w => membership('device_groups', w) },
  tag: { usage: 'tag add|remove <device> <tag…>', text: 'change the tags of a device', change: true, to: w => membership('device_tags', w) },
  pause: { usage: 'pause <persona> <minutes>', text: "pause a child's internet", change: true, to: w => ['change', 'family_pause', ...w] }
})
const list = words => JSON.stringify(words)
const membership = (name, words) => {
  const [action, device, ...rest] = words
  if (!['add', 'remove'].includes(action) || !device) throw new Error('expected add or remove, then a device')
  const values = rest.filter((w, i) => !(i === 0 && ['to', 'from'].includes(w.toLowerCase())))
  if (!values.length) throw new Error('name at least one')
  return ['change', name, `device=${device}`, `${action}=${list(values)}`]
}

const SESSION = Object.freeze({
  help: 'help [command]', status: 'status', open: 'open <page|device>', read: 'read <operation> [field=value…]', do: 'do <operation> [field=value…]', ops: 'ops [text]',
  describe: 'describe <operation>', history: 'history', requests: 'requests', model: 'model', clear: 'clear', chat: 'chat', ask: 'ask <question>'
})
const SESSION_TEXT = Object.freeze({
  help: 'this list, or the details of one command', status: 'uplinks, devices and plugins at a glance', open: 'open a page of the UI, or one device',
  read: 'print the data of one read operation', do: 'prepare one granular change for review, or open its form', ops: 'list read and change operations', describe: 'fields of one operation', history: 'lines typed in this session',
  requests: 'router requests made by the last answer', model: 'state of the local model', clear: 'start a new conversation', chat: 'switch to the chat view',
  ask: 'send the rest of the line as a question'
})
const TOP_WORDS = () => [...new Set(['show', 'change', 'setup', 'man', ...Object.keys(SESSION), ...Object.keys(EVERYDAY)])].sort()

export const tokenize = (line) => {
  const tokens = []
  let current = '', quote = null, depth = 0, started = false, inString = false
  for (const ch of String(line)) {
    if (depth > 0) {
      current += ch
      if (ch === '"') inString = !inString
      else if (!inString && (ch === '{' || ch === '[')) depth += 1
      else if (!inString && (ch === '}' || ch === ']')) depth -= 1
      continue
    }
    if (quote) { if (ch === quote) quote = null; else current += ch; continue }
    if (ch === '"' || ch === "'") { quote = ch; started = true; continue }
    if (ch === '{' || ch === '[') { depth = 1; current += ch; continue }
    if (/\s/.test(ch)) { if (current || started) tokens.push(current); current = ''; started = false; continue }
    current += ch
  }
  if (current || started) tokens.push(current)
  return tokens
}

const splitPipes = (line) => {
  const parts = []
  let current = '', quote = null
  for (const ch of line) {
    if (quote) { if (ch === quote) quote = null; current += ch; continue }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue }
    if (ch === '|') { parts.push(current); current = ''; continue }
    current += ch
  }
  return [...parts, current].map(p => p.trim())
}

const coerce = (raw, schema, field) => {
  const type = schema?.type
  if (NUMERIC.includes(type)) {
    if (!/^-?\d+(\.\d+)?$/.test(raw)) throw new Error(`${field} must be a number`)
    return Number(raw)
  }
  if (type === 'boolean') {
    if (/^(true|on|yes)$/i.test(raw)) return true
    if (/^(false|off|no)$/i.test(raw)) return false
    throw new Error(`${field} must be true or false`)
  }
  if (type === 'array' || type === 'object') {
    if (/^[[{]/.test(raw)) { try { return JSON.parse(raw) } catch (error) { throw new Error(`${field} is not valid JSON`) } }
    if (type === 'object') throw new Error(`${field} must be JSON: ${field}={…}`)
    return raw.split(',').map(v => v.trim()).filter(Boolean).map(v => coerce(v, schema.items, field))
  }
  return raw
}

export const buildInput = (command, words) => {
  if (words.length === 1 && words[0].startsWith('{')) {
    try { return JSON.parse(words[0]) } catch (error) { throw new Error('input is not valid JSON') }
  }
  const properties = command.schema?.properties || {}, names = command.fields.map(f => f.name)
  const input = {}, bare = []
  for (const word of words) {
    const at = word.indexOf('=')
    const key = at > 0 ? word.slice(0, at) : null
    if (key && names.includes(key)) input[key] = coerce(word.slice(at + 1), properties[key], key)
    else bare.push(word)
  }
  const open = names.filter(f => !(f in input))
  open.forEach((field, index) => {
    if (!bare.length) return
    const schema = properties[field], last = index === open.length - 1
    if (schema?.type === 'array') input[field] = bare.splice(0).flatMap(w => coerce(w, schema, field))
    else if (schema?.type === 'object') input[field] = coerce(bare.shift(), schema, field)
    else input[field] = coerce(last && !NUMERIC.includes(schema?.type) && schema?.type !== 'boolean' && !schema?.enum ? bare.splice(0).join(' ') : bare.shift(), schema, field)
  })
  if (bare.length) throw new Error(`unexpected: ${bare.join(' ')}`)
  for (const f of command.fields) if (f.required && !(f.name in input) && properties[f.name]?.type === 'array' && Object.keys(input).length) input[f.name] = []
  const missing = command.fields.filter(f => f.required && !(f.name in input))
  if (missing.length) throw new Error(`missing ${missing.map(f => `<${f.name}>`).join(' ')}`)
  return input
}

const distance = (a, b) => {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]; row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const keep = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = keep
    }
  }
  return row[b.length]
}
const nearest = (word, candidates) => candidates.map(c => [distance(word, c), c]).filter(([d]) => d <= 2).sort((a, b) => a[0] - b[0]).map(([, c]) => c)

const columns = (rows) => {
  const width = Math.max(...rows.map(([left]) => left.length))
  return rows.map(([left, right]) => `  ${left.padEnd(width + 2)}${right}`)
}
export const helpAll = (commands = cliCommands()) => [
  'Everyday',
  ...columns(Object.values(EVERYDAY).filter(e => !e.reading).map(e => [e.usage, e.text])),
  '',
  'Readings (current data of one area, as a table)',
  ...columns(Object.values(EVERYDAY).filter(e => e.reading).map(e => [e.usage, e.text])),
  '',
  'Look (answered by code, no model)',
  ...columns(commands.filter(c => c.verb === 'show').map(c => [`show ${c.name} ${c.usage}`.trim(), c.label])),
  '',
  'Change (prepared for review; nothing is applied until you type y)',
  ...columns(commands.filter(c => c.verb === 'change').map(c => [`change ${c.name}`, c.label])),
  '',
  'Setup (opens the product page for that step)',
  ...columns(commands.filter(c => c.verb === 'setup').map(c => [`setup ${c.name}`, c.label])),
  '',
  'Session',
  ...columns(Object.keys(SESSION).map(k => [SESSION[k], SESSION_TEXT[k]])),
  '',
  'help <command> shows its fields. Add --json to a show or read command for the raw data.',
  'ops lists every granular operation; read <operation> prints one, do <operation> prepares a change.',
  'Pipes: | grep [-v] text, | head N, | tail N, | sort, | count.   History: !!, !$, !N.',
  'Anything that is not a command is asked in plain words.'
].join('\n')


export const AREAS = Object.freeze({
  devices: { text: 'who is on the network; block, rename, group', items: ['devices', 'groups', 'show device_record', 'show device_policies', 'show internet_permission',
    'show devices_sharing_groups', 'block', 'allow', 'dns-only', 'rename', 'group', 'tag'], open: ['devices', 'a device name'] },
  wifi: { text: 'signal, connected stations, radios', items: ['signal', 'stations', 'wifi', 'show wifi_security'], open: ['wifi', 'signal'] },
  network: { text: 'uplinks, internet health, addresses, mesh, VPN', items: ['uplinks', 'diagnose', 'wan', 'outages', 'speed', 'dhcp', 'interfaces', 'topology', 'mesh', 'vpn',
    'setup pppoe', 'setup wireless_uplink', 'setup remote_vpn', 'setup site_vpn'], open: ['uplink', 'wan', 'dhcp', 'mesh', 'vpn', 'topology'] },
  traffic: { text: 'how much data, by device', items: ['traffic'], open: ['traffic', 'bandwidth', 'timeseries', 'insights'] },
  firewall: { text: 'port forwards, allowing or blocking a service', items: ['forwards', 'firewall', 'change port_forward', 'change allow_service', 'change block_service'], open: ['firewall', 'services', 'pfw'] },
  dns: { text: 'blocked lookups, block lists, ad blocking', items: ['dns-blocks', 'blocklists', 'show device_dns_lists', 'change ads_everywhere', 'change ads_for_devices', 'dns',
    'hostnames', 'dyndns', 'setup dyndns'], open: ['dns', 'dns-log', 'hostnames', 'dns-settings', 'dyndns'] },
  alerts: { text: 'alerts that fired, alert rules, event log', items: ['alerts', 'rules', 'log', 'buckets', 'change new_alert_rule', 'change edit_alert_rule', 'notifications'],
    open: ['alerts', 'events', 'notifications'] },
  family: { text: 'personas: schedules, limits and pauses', items: ['personas', 'setup personas', 'show family_schedule', 'pause', 'change family_limits', 'change family_dns'], open: [] },
  system: { text: 'overview, plugins, services, version', items: ['status', 'plugins', 'system', 'services', 'containers', 'backups', 'flags', 'model'], open: ['info', 'plugins', 'auth', 'flags'] }
})

const PLAIN = Object.freeze({
  'show device_record': 'saved details of one device', 'show device_policies': 'policies of one device', 'show internet_permission': 'may it use the internet',
  'show devices_sharing_groups': 'devices in the same groups', 'show wifi_security': 'WPA2 or WPA3 setting of one device',
  'show device_dns_lists': 'block lists that apply to one device', 'change ads_everywhere': 'turn on ad blocking for everyone', 'change ads_for_devices': 'block ads for chosen devices',
  'setup dyndns': 'opens the Dynamic DNS page', 'change port_forward': 'forward a port to a device', 'change allow_service': 'let devices reach one service',
  'change block_service': 'stop devices reaching one service', 'change new_alert_rule': 'create an alert rule',
  'change edit_alert_rule': 'change an alert rule', 'show family_schedule': 'blocked hours of one child', 'change family_limits': "set a child's time limits",
  'change family_dns': 'family-safe DNS on or off', 'setup personas': 'create or update a persona', 'setup pppoe': 'add a PPPoE uplink (opens Link Settings)',
  'setup wireless_uplink': 'add a WiFi uplink (opens Link Settings)', 'setup remote_vpn': 'add a VPN client (opens VPN)', 'setup site_vpn': 'add a site VPN (opens VPN)'
})

const itemRow = (item, commands) => {
  const [verb, name] = item.split(' ')
  if (name) {
    const command = commands.find(c => c.verb === verb && c.name === name)
    return command ? [`${verb} ${name} ${command.fields.filter(f => f.required && verb === 'show').map(f => `<${f.name}>`).join(' ')}`.trim(), PLAIN[item] || command.label] : null
  }
  if (EVERYDAY[item]) return [EVERYDAY[item].usage, EVERYDAY[item].text]
  return SESSION[item] ? [SESSION[item], SESSION_TEXT[item]] : null
}

export const helpText = () => [
  'Type a command, or just ask in plain words.',
  '',
  ...columns(Object.entries(AREAS).map(([name, area]) => [name, area.text])),
  '',
  'help <area> lists its commands, for example: help dns',
  'status shows the router at a glance. A change always asks before it is applied.',
  'help advanced covers filters, history and raw operations.'
].join('\n')

const areaHelp = (name, commands) => {
  const area = AREAS[name]
  const rows = area.items.map(item => itemRow(item, commands)).filter(Boolean)
  return [
    ...columns(rows),
    ...(area.open.length ? ['', `open ${area.open.join(' | ')}   goes to that page`] : []),
    '',
    `help <command> explains one, for example: help ${(rows.map(([usage]) => usage.split(' ')[0]).find(word => !AREAS[word] && !PREFIX[word]) || rows[0][0])}`
  ].join('\n')
}

const ADVANCED = [
  'Filter output      devices | grep bulb | sort | head 5      (also tail N, count)',
  'Raw data           add --json to a show or reading command',
  'Repeat             !! previous line · !$ its last word · !N line N · history',
  'Any operation      ops [text] lists them · describe <operation> · read <operation> · do <operation>',
  'Session            requests · model · clear · chat · ask <question>',
  'Everything         help all'
].join('\n')

const commandHelp = (command) => [
  `${command.verb} ${command.name} ${command.usage}`.trim(),
  `  ${command.label}`,
  ...(command.description && command.description !== command.label ? [`  ${command.description}`] : []),
  ...(command.fields.length ? ['', 'Fields', ...columns(command.fields.map(f => [`${f.name}${f.required ? '' : ' (optional)'}`, `${f.type}${f.text ? ` — ${f.text}` : ''}`]))] : []),
  ...(command.kind === 'ui' ? ['', 'Opens the product page for this step. Values are entered there, not on the command line.'] : []),
  ...(command.verb === 'change' ? ['', 'A change is shown for review first. Type y to apply it or n to discard it.'] : [])
].join('\n')

export const helpFor = (topic, commands = cliCommands()) => {
  const wanted = topic.trim().toLowerCase()
  if (AREAS[wanted] && !/ /.test(wanted)) {
    return areaHelp(wanted, commands)
  }
  if (wanted === 'all') return helpAll(commands)
  if (wanted === 'advanced' || wanted === 'more') return ADVANCED
  const words = tokenize(topic.toLowerCase().replace(/-/g, (m, i) => i ? '_' : m))
  const name = words[words.length - 1]
  const exact = commands.filter(c => c.name === name && (words.length === 1 || c.verb === words[0]))
  if (exact.length) return exact.map(commandHelp).join('\n\n')
  const everyday = EVERYDAY[topic.toLowerCase()]
  if (everyday) return `${everyday.usage}\n  ${everyday.text}`
  if (SESSION[topic.toLowerCase()]) return `${SESSION[topic.toLowerCase()]}\n  ${SESSION_TEXT[topic.toLowerCase()]}`
  if (PREFIX[topic.toLowerCase()]) return columns(commands.filter(c => c.verb === topic.toLowerCase()).map(c => [`${c.verb} ${c.name} ${c.usage}`.trim(), c.label])).join('\n')
  const close = nearest(name, commands.map(c => c.name))
  return `No command named ${topic}.${close.length ? ` Did you mean ${close.slice(0, 3).join(', ')}?` : ' Type help for the list.'}`
}

const allOperations = () => [...cliReadOperations().map(o => ({ ...o, kind: 'read' })), ...cliDoOperations()].sort((a, b) => a.id.localeCompare(b.id))
const verbOf = operation => operation.kind === 'read' ? 'read' : 'do'
export const operationsText = (filter = '', operations = allOperations()) => {
  const wanted = filter.toLowerCase()
  const found = operations.filter(o => !wanted || o.id.includes(wanted) || o.label.toLowerCase().includes(wanted))
  return found.length ? columns(found.map(o => [`${verbOf(o).padEnd(4)} ${o.id}`, `${o.label}${o.kind === 'ui' ? ' (form)' : ''}`])).join('\n') : `No operation matches ${filter}.`
}
export const describeOperation = (id, operations = allOperations()) => {
  const operation = operations.find(o => o.id === id)
  if (!operation) return null
  const properties = operation.schema?.properties || {}, required = operation.schema?.required || []
  const fields = Object.keys(properties).map(f => describeField(f, properties[f], required.includes(f)))
  return [`${verbOf(operation)} ${id} ${usageOf(fields)}`.trim(), `  ${operation.label}`,
    ...(fields.length ? ['', 'Fields', ...columns(fields.map(f => [`${f.name}${f.required ? '' : ' (optional)'}`, `${f.type}${f.text ? ` — ${f.text}` : ''}`]))] : []),
    ...(operation.kind === 'write' ? ['', 'Shown for review first. Type y to apply it or n to discard it.'] : operation.kind === 'ui' ? ['', 'Opens the product page for this step; nothing is changed from the command line.'] : [])].join('\n')
}

const scalar = v => v === null || typeof v !== 'object'
const cell = v => v === null || v === undefined ? '' : Array.isArray(v) ? (v.every(scalar) ? v.join(',') : `${v.length} items`) : typeof v === 'object' ? '{…}' : String(v)
const clip = (text, width) => text.length > width ? `${text.slice(0, width - 1)}…` : text
export const formatData = (value, indent = '') => {
  if (scalar(value)) return `${indent}${cell(value)}`
  if (Array.isArray(value)) {
    if (!value.length) return `${indent}(none)`
    if (value.every(scalar)) return value.map(v => `${indent}${cell(v)}`).join('\n')
    if (value.every(v => v && typeof v === 'object' && !Array.isArray(v))) {
      const keys = [...new Set(value.flatMap(Object.keys))].filter(k => value.every(row => row[k] === undefined || scalar(row[k]) || Array.isArray(row[k]) && row[k].every(scalar))).slice(0, 8)
      if (keys.length) {
        const rows = value.map(row => keys.map(k => clip(cell(row[k]), 32)))
        const widths = keys.map((k, i) => Math.max(k.length, ...rows.map(r => r[i].length)))
        const line = cells => `${indent}${cells.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd()}`
        return [line(keys.map(k => k.toUpperCase())), ...rows.map(line)].join('\n')
      }
    }
    return value.map((v, i) => `${indent}[${i}]\n${formatData(v, `${indent}  `)}`).join('\n')
  }
  const entries = Object.entries(value)
  if (!entries.length) return `${indent}(empty)`
  const width = Math.min(28, Math.max(...entries.map(([k]) => k.length)))
  return entries.map(([k, v]) => scalar(v) || Array.isArray(v) && v.every(scalar) && cell(v).length <= 80
    ? `${indent}${k.padEnd(width)}  ${cell(v)}` : `${indent}${k}\n${formatData(v, `${indent}  `)}`).join('\n')
}

const parsePipe = (text) => {
  const [name, ...args] = tokenize(text)
  const number = () => { if (!/^\d+$/.test(args[0] || '')) throw new Error(`${name} needs a number`); return Number(args[0]) }
  if (name === 'grep') {
    const invert = args[0] === '-v', pattern = (invert ? args.slice(1) : args).join(' ')
    if (!pattern) throw new Error('grep needs text to look for')
    return { name, invert, pattern: pattern.toLowerCase() }
  }
  if (name === 'head' || name === 'tail') return { name, count: number() }
  if (name === 'sort' || name === 'count' || name === 'wc') return { name: name === 'wc' ? 'count' : name }
  throw new Error(`unknown filter: ${name || '(empty)'}. Filters are grep, head, tail, sort, count.`)
}
export const applyPipes = (text, pipes = []) => pipes.reduce((current, pipe) => {
  const lines = current.split('\n')
  if (pipe.name === 'grep') return lines.filter(l => l.toLowerCase().includes(pipe.pattern) !== pipe.invert).join('\n')
  if (pipe.name === 'head') return lines.slice(0, pipe.count).join('\n')
  if (pipe.name === 'tail') return lines.slice(-pipe.count).join('\n')
  if (pipe.name === 'sort') return [...lines].sort((a, b) => a.localeCompare(b)).join('\n')
  return String(lines.filter(l => l.trim()).length)
}, text)

const parseCommand = (words, text, commands) => {
  const first = words[0].toLowerCase()
  const rest = words.slice(1)
  const ask = { kind: 'ask', text }
  const fail = (message) => ({ kind: 'error', message })

  if (first === 'ask') return rest.length ? { kind: 'ask', text: text.replace(/^\s*ask\s+/i, '') } : fail('usage: ask <question>')
  if (first === 'help' || first === 'man') return { kind: 'help', topic: rest.join(' ') }

  if (PREFIX[first]) {
    if (!rest.length) return { kind: 'help', topic: first }
    const json = first === 'show' && rest.includes('--json')
    const args = rest.filter(w => w !== '--json')
    const name = args[0].toLowerCase().replace(/-/g, '_')
    const command = commands.find(c => c.verb === first && c.name === name)
    if (!command) {
      const close = nearest(name, commands.filter(c => c.verb === first).map(c => c.name))
      return close.length && args.length <= 3 ? fail(`No command ${first} ${args[0]}. Did you mean ${first} ${close[0]}?`) : ask
    }
    try {
      const input = buildInput(command, args.slice(1))
      const kind = first === 'show' ? 'read' : command.kind === 'ui' ? 'setup' : 'change'
      return { kind, id: command.id, command: `${first} ${command.name}`, input, ...(json ? { json: true } : {}) }
    } catch (error) {
      return fail(`${error.message}\nusage: ${first} ${command.name} ${command.usage}`.trim())
    }
  }

  if (first === 'status' && !rest.length)
    return { kind: 'many', command: 'status', reads: ['uplink_health', 'device_count', 'plugins'].map(n => commands.find(c => c.verb === 'show' && c.name === n)).filter(Boolean).map(c => ({ id: c.id, title: c.label, input: {} })) }
  if (first === 'dns-blocks') {
    if (rest.some(w => SENTENCE_WORDS.has(w.toLowerCase()))) return ask
    const minutes = /^\d+$/.test(rest[rest.length - 1] || '') ? Number(rest[rest.length - 1]) : null
    const device = (minutes === null ? rest : rest.slice(0, -1)).join(' ')
    if (minutes !== null && (minutes < 1 || minutes > 10080)) return fail('minutes must be between 1 and 10080\nusage: dns-blocks [device] [minutes]')
    return { kind: 'blocks', command: 'dns-blocks', minutes: minutes ?? 60, ...(device ? { device } : {}), everyday: true }
  }
  if (first === 'explain') {
    if (rest.length !== 1) return rest.length ? ask : fail(`usage: ${EVERYDAY.explain.usage}`)
    if (!(rest[0] in explanations)) return fail(`No topic ${rest[0]}.\nusage: ${EVERYDAY.explain.usage}`)
    return { kind: 'read', id: 'tasks.explain', command: 'explain', input: { topic: rest[0] } }
  }
  if (first === 'read' || first === 'do') {
    if (!rest.length) return fail(`usage: ${SESSION[first]}\nops lists the operations.`)
    const json = first === 'read' && rest.includes('--json')
    const args = rest.filter(w => !(first === 'read' && w === '--json'))
    const operation = (first === 'read' ? cliReadOperations() : cliDoOperations()).find(o => o.id === args[0])
    if (!operation) return /^[a-z_]+(\.[a-z_]+)+$/.test(args[0]) ? fail(`No ${first === 'read' ? 'read' : 'change'} operation ${args[0]}. ops lists them.`) : ask
    const fields = Object.keys(operation.schema?.properties || {}), required = operation.schema?.required || []
    try {
      const input = buildInput({ schema: operation.schema, fields: [...required, ...fields.filter(f => !required.includes(f))].map(f => ({ name: f, required: required.includes(f) })) }, args.slice(1))
      return { kind: first === 'read' ? 'raw' : operation.kind === 'ui' ? 'setup' : 'change', id: operation.id, command: `${first} ${operation.id}`, input, ...(json ? { json: true } : {}) }
    } catch (error) {
      return fail(`${error.message}\ndescribe ${operation.id} shows its fields.`)
    }
  }
  if (first === 'describe') return rest.length === 1 ? { kind: 'session', name: 'describe', args: rest } : rest.length ? ask : fail(`usage: ${SESSION.describe}`)
  if (first === 'ops') return rest.length <= 1 ? { kind: 'session', name: 'ops', args: rest } : ask
  if (first === 'open') {
    if (!rest.length) return fail(`usage: ${SESSION.open}\npages: ${Object.keys(PAGES).join(', ')}`)
    if (rest.some(w => SENTENCE_WORDS.has(w.toLowerCase()))) return ask
    return { kind: 'open', target: rest.join(' '), everyday: true }
  }
  if (['history', 'requests', 'model', 'clear', 'chat'].includes(first)) return rest.length ? ask : { kind: 'session', name: first, args: [] }

  const everyday = EVERYDAY[first]
  if (everyday?.to) {
    if (rest.some(w => SENTENCE_WORDS.has(w.toLowerCase()))) return ask
    if (everyday.change && !rest.length) return fail(`usage: ${everyday.usage}`)
    try {
      const parsed = parseCommand(everyday.to(rest), text, commands)
      if (parsed.kind === 'error') return rest.length ? fail(`${parsed.message.split('\n')[0]}\nusage: ${everyday.usage}`) : fail(`usage: ${everyday.usage}`)
      return { ...parsed, everyday: true }
    } catch (error) {
      return fail(`${error.message}\nusage: ${everyday.usage}`)
    }
  }
  return ask
}

export const parseCli = (line, commands = cliCommands()) => {
  const text = String(line || '').trim()
  if (!text) return { kind: 'empty' }
  if (text.startsWith('?')) return text.slice(1).trim() ? { kind: 'ask', text: text.slice(1).trim() } : { kind: 'help', topic: '' }
  const [head, ...filters] = splitPipes(text)
  const words = tokenize(head)
  if (!words.length) return { kind: 'empty' }
  if (words.length > 1 && words[0].toLowerCase() === 'dns' && words[1].toLowerCase() === 'blocks') words.splice(0, 2, 'dns-blocks')
  const parsed = parseCommand(words, text, commands)
  if (!filters.length || parsed.kind === 'ask' || parsed.kind === 'error' || parsed.kind === 'empty') return parsed
  if (['change', 'setup', 'open'].includes(parsed.kind) || parsed.kind === 'session' && ['clear', 'chat'].includes(parsed.name)) return { kind: 'error', message: 'Only output can be piped; this command has none.' }
  try { return { ...parsed, pipes: filters.map(parsePipe) } } catch (error) { return { kind: 'error', message: error.message } }
}

const quoted = name => /\s/.test(name) ? `"${name}"` : name
export const completeCli = (line, names = {}, commands = cliCommands()) => {
  const text = String(line || '').replace(/^\s+/, '')
  const at = text.search(/\S*$/), before = text.slice(0, at), word = text.slice(at).toLowerCase()
  const words = tokenize(before)
  const bare = v => v.toLowerCase().replace(/"/g, '')
  const offer = values => [...new Set(values)].filter(v => bare(v).startsWith(bare(word))).sort((a, b) => bare(a).localeCompare(bare(b))).map(v => `${before}${v}`)
  if (!words.length) return offer(TOP_WORDS())
  const first = words[0].toLowerCase()
  const devices = (names.devices || []).map(quoted), groups = (names.groups || []).map(quoted), tags = (names.tags || []).map(quoted)
  if (words.length === 1) {
    if (PREFIX[first]) return offer(commands.filter(c => c.verb === first).map(c => c.name))
    if (first === 'help' || first === 'man') return offer([...commands.map(c => c.name), ...Object.keys(EVERYDAY), ...Object.keys(SESSION)])
    if (first === 'read') return offer(cliReadOperations().map(o => o.id))
    if (first === 'do') return offer(cliDoOperations().map(o => o.id))
    if (first === 'describe') return offer(allOperations().map(o => o.id))
    if (first === 'open') return offer([...Object.keys(PAGES), ...devices])
    if (first === 'explain') return offer(Object.keys(explanations))
    if (first === 'diagnose') return offer(['internet', 'dns', 'vpn', 'uplink'])
    if (first === 'group' || first === 'tag') return offer(['add', 'remove'])
  }
  if (first === 'group' || first === 'tag') return offer(words.length === 2 ? devices : first === 'group' ? groups : tags)
  if (['block', 'allow', 'dns-only', 'groups', 'signal', 'rename', 'diagnose', 'traffic', 'dns-blocks'].includes(first)) return offer(devices)
  if (first === 'devices') return offer(['group=', 'policy=', 'tag=', ...groups.map(g => `group=${g}`), ...tags.map(t => `tag=${t}`)])
  const command = PREFIX[first] && commands.find(c => c.verb === first && c.name === words[1]?.toLowerCase().replace(/-/g, '_'))
  if (!command) return []
  const equals = word.indexOf('=')
  if (equals > 0) {
    const field = command.fields.find(f => f.name.toLowerCase() === word.slice(0, equals)), schema = command.schema.properties[field?.name]
    if (!field) return []
    const values = schema.enum || schema.items?.enum || (DEVICE_FIELDS.has(field.name) ? devices : field.name === 'group' ? groups : field.name === 'tag' ? tags : schema.type === 'boolean' ? ['true', 'false'] : [])
    return offer(values.map(v => `${field.name}=${v}`))
  }
  const used = new Set(words.slice(2).map(w => w.split('=')[0]))
  const open = command.fields.filter(f => !used.has(f.name))
  const next = open.find(f => f.required) || open[0]
  const schema = next && command.schema.properties[next.name]
  return offer([
    ...(next && DEVICE_FIELDS.has(next.name) ? devices : []),
    ...(schema?.enum || []),
    ...open.map(f => `${f.name}=`),
    ...(first === 'show' ? ['--json'] : [])
  ])
}

const BLOCK_BUCKET = 'dns:block:event', BLOCK_PAGE = 200
const tally = (values) => [...values.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
const when = (row) => { const t = Date.parse(row.time || row.Timestamp || ''); return Number.isFinite(t) ? t : null }
const clock = (t) => t === null ? '' : new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const runBlocks = async ({ device, minutes }, context) => {
  const since = Date.now() - minutes * 60000
  const listed = (await readUIOperation('devices.list', {}, context)).data
  const devices = Array.isArray(listed) ? listed : Array.isArray(listed?.devices) ? listed.devices : Object.values(listed || {}).filter(d => d && typeof d === 'object')
  let target = null
  if (device) {
    const found = matchDevices(devices, device)
    if (found.length !== 1) throw new Error(found.length ? `${device} matches ${found.length} devices; use an exact name.` : `No device named ${device}.`)
    target = found[0]
    if (!target.RecentIP) throw new Error(`${target.Name || device} has no recent IP address, so its DNS lookups cannot be matched.`)
  }
  let page
  try {
    page = (await readUIOperation('monitor.events.query', { bucket: BLOCK_BUCKET, num: BLOCK_PAGE, min: new Date(since).toISOString() }, context)).data
  } catch (error) {
    if (/exact current bucket/.test(error?.message || '')) return { message: 'No DNS blocks have been recorded: the router has no block event log yet.', data: {} }
    throw error
  }
  const nameOf = ip => devices.find(d => d.RecentIP === ip)?.Name || ip
  const all = (page.rows || []).filter(r => r && typeof r === 'object' && (when(r) === null || when(r) >= since))
  const rows = (target ? all.filter(r => r.ClientIP === target.RecentIP) : all).sort((a, b) => (when(b) ?? 0) - (when(a) ?? 0))
  const scope = target ? ` for ${target.Name || device}` : ''
  const limit = page.mayHaveMore ? ` Only ${BLOCK_PAGE} events were read, so earlier ones in this period may be missing.` : ''
  if (!rows.length) return { message: `No DNS blocks${scope} in the last ${minutes} minutes.${limit}`, data: { facts: { device: target || undefined } } }
  const top = (title, pairs) => [title, ...pairs.slice(0, 10).map(([name, count]) => `  ${String(count).padStart(5)}  ${name}`)]
  const domains = tally(rows.map(r => String(r.Name || '').replace(/\.$/, '')))
  const lines = [
    `${rows.length} DNS block${rows.length === 1 ? '' : 's'}${scope} in the last ${minutes} minutes, ${domains.length} domain${domains.length === 1 ? '' : 's'}.${limit}`,
    '', ...top('Most blocked domains', domains),
    ...(target ? [] : ['', ...top('Devices', tally(rows.map(r => nameOf(r.ClientIP))))]),
    '', 'Latest',
    ...rows.slice(0, 15).map(r => `  ${clock(when(r))}  ${target ? '' : `${clip(nameOf(r.ClientIP), 22).padEnd(22)}  `}${String(r.Name || '').replace(/\.$/, '')}`)
  ]
  return { message: lines.join('\n'), data: { facts: { device: target || undefined } } }
}

export const runCliRead = async (parsed, context = {}) => {
  if (parsed.kind === 'blocks') return runBlocks(parsed, context)
  const result = await readUIOperation(parsed.id, parsed.input, context)
  const data = result.data || {}
  if (parsed.kind === 'raw') return { message: parsed.json ? JSON.stringify(data, null, 2) : formatData(data), data: {} }
  if (data.truncated) return { message: 'The answer was too large to show completely. Narrow the request.', data }
  if (parsed.json) return { message: JSON.stringify(data.facts ?? data, null, 2), data: { ...data, facts: { ...(data.facts || {}), view: undefined } } }
  if (typeof data.message !== 'string') return { message: formatData(data), data }
  return { message: data.message, data }
}
