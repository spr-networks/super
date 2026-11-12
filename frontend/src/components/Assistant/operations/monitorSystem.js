import { api, alertsAPI, authAPI, dbAPI, featureFlagsAPI, getApiURL, logsAPI, pfwAPI, pluginAPI, wifiAPI } from 'api'
import { deviceAPI } from '../assistantDeviceApi'
import { getNotificationsLog, clearNotificationsLog } from 'NotificationsLog'
import { isPasskeySupported } from 'api/Passkey'
import { object, string, integer, boolean, array, enumValue } from '../operationSchema'

const empty = object({})
const text = (maxLength = 512) => ({ ...string(), maxLength })
const count = (maximum = 200) => ({ ...integer(), minimum: 1, maximum })
const index = { ...integer(), minimum: 0 }
const clone = value => JSON.parse(JSON.stringify(value))
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
    : value
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
const check = (condition, message) => { if (!condition) throw new Error(message) }
const source = name => `frontend/src/${name}`
const secretKey = /^(token|secret|password|psk|authdata|authorization|privatekey|private_key|jwt|code|otpauth)$/i
const cleanText = value => value
  .replace(/\b(Bearer|Basic)\s+[^\s"']+/gi, '$1 [redacted]')
  .replace(/([a-z]+:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
  .replace(/((?:token|secret|password|psk|api_key|apikey|jwt)\s*[=:]\s*)([^\s,;&"']+)/gi, '$1[redacted]')
  .slice(0, 2000)
const redact = (value, depth = 0) => {
  if (depth > 8) return '[depth limit]'
  if (typeof value === 'string') return cleanText(value)
  if (Array.isArray(value)) return value.slice(0, 200).map(item => redact(item, depth + 1))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).slice(0, 100).map(([key, item]) =>
    [key, secretKey.test(key) ? '[redacted]' : redact(item, depth + 1)]))
}
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]))
const evidence = (verified, summary, data) => ({ verified, summary, data: redact(data) })
const spec = (id, label, kind, schema, run, extra = {}) => ({
  id, domain: id.startsWith('monitor.') ? 'monitor' : 'system', label,
  description: label, kind, schema, run: async (input, context = {}) => run(input, context),
  redact, ...extra
})
const read = (id, label, schema, run, extra) => spec(id, label, 'read', schema, run, extra)
const write = (id, label, schema, snapshot, project, run, extra) =>
  spec(id, label, 'write', schema, run, { snapshot, project, ...extra })
const ui = (id, label, route, instructions, sources) => spec(id, label, 'ui', empty,
  async () => ({ route, instructions }), { route, instructions, sources, menus: ['System > Auth'] })

const alertAction = object({
  SendNotification: boolean(), StoreAlert: boolean(), GrabEvent: boolean(),
  NotificationType: enumValue(['info', 'warning', 'success', 'error']),
  MessageTitle: text(), MessageBody: text(2000), GrabFields: array(text())
})
const alertFields = {
  Name: text(), TopicPrefix: text(), Disabled: boolean(), MatchAnyOne: boolean(), InvertRule: boolean(),
  Conditions: array(object({ JPath: text(2000) }, ['JPath'])), Actions: array(alertAction)
}
const alertMeta = { sources: [source('api/Alerts.js'), source('components/Alerts/AddAlert.js')], menus: ['Monitor > Alerts'] }
const alertAt = (rows, position) => {
  check(Array.isArray(rows) && rows[position], 'Alert index no longer exists; read alerts again')
  return rows[position]
}
const alertPatch = (input, before) => {
  const next = { ...alertAt(before, input.index), ...(input.changes || {}) }
  if (input.actionChanges) {
    const actionIndex = input.actionIndex ?? 0
    check(Array.isArray(next.Actions) && next.Actions[actionIndex], 'Alert action index does not exist')
    next.Actions = next.Actions.map((action, i) => i === actionIndex ? { ...action, ...input.actionChanges } : action)
  }
  check(Object.keys(input.changes || {}).length || Object.keys(input.actionChanges || {}).length, 'No alert changes supplied')
  return next
}
const pluginKeys = ['Name', 'URI', 'UnixPath', 'ComposeFilePath', 'Enabled', 'GitURL', 'HasUI', 'SandboxedUI', 'HasTopology', 'InstallTokenPath', 'ScopedPaths', 'Runtime', 'AvailableRuntimes', 'Plus', 'Description']
const pluginFields = {
  Name: text(), URI: text(), UnixPath: text(), ComposeFilePath: text(), Enabled: boolean(),
  GitURL: text(1500), HasUI: boolean(), SandboxedUI: boolean(), HasTopology: boolean(),
  InstallTokenPath: text(), ScopedPaths: array(text()), Runtime: enumValue(['default', 'kvm'])
}
const pluginMeta = { sources: [source('api/Plugin.js'), source('components/Plugins/EditPlugin.js')], menus: ['System > Plugins'] }
const exactPlugin = (plugins, name) => {
  const found = plugins.filter(item => item.Name === name)
  check(found.length === 1, 'Choose one exact, unique plugin Name from the current inventory')
  return found[0]
}
const safePlugin = item => redact(pick(item, pluginKeys))
const validatePlugin = (value, previous = null) => {
  if (value.GitURL) {
    const url = new URL(value.GitURL)
    check(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash,
      'Plugin repository must be an HTTPS URL without credentials, query or fragment')
  }
  check((value.ScopedPaths || []).every(path => path.startsWith('/') && !path.includes('..')), 'ScopedPaths must be explicit API paths')
  if (value.Runtime === 'kvm' && previous?.Runtime !== 'kvm') {
    check(previous && ((previous.AvailableRuntimes || []).includes('kvm') ||
      (previous.ComposeFilePath || '').endsWith('/docker-compose-kvm.yml')), 'This plugin does not advertise a KVM runtime')
  }
  return value
}
const pluginPatch = (input, before) => validatePlugin({ ...before, ...input.changes, Name: before.Name }, before)
const taskMeta = { sources: [source('api/Pfw.js'), source('views/System/PfwTasks.js')], menus: ['Monitor > Tasks'] }
const taskSnapshot = async () => pfwAPI.getTaskConfig()
const taskGate = context => check(context.isPlusDisabled !== true, 'Tasks require an available PLUS/PFW capability')
const taskNext = (before, changes) => ({ ...before, ...changes,
  ...(changes.Time ? { Time: { ...before?.Time, ...changes.Time } } : {}) })
const schedules = ['*/5 * * * *', '*/10 * * * *', '*/15 * * * *', '0,30 * * * *', '0 * * * *', '0 */12 * * *', '0 0 * * *']
const taskBase = { Disabled: boolean(), Time: object({ CronExpr: enumValue(schedules) }, ['CronExpr']) }
const hostnameSchema = string({ maxLength: 253, minLength: 1, pattern: '^[a-zA-Z0-9-]+$' })
const systemMeta = { sources: [source('views/System/SystemInfo.js')], menus: ['System > System Info'] }
const flagsMeta = { sources: [source('api/FeatureFlags.js'), source('views/System/FeatureFlags.js')], menus: ['System > Feature Flags'] }
const flagsNext = ({ name, enabled }, before) => {
  check(Array.isArray(before), 'Feature flags could not be read; preserve state and retry')
  check(before.every(flag => ['rustap', 'webllm'].includes(flag)),
    'Cannot preserve unsupported current feature flags: the backend rejects them in a full-array update. No save was attempted; resolve backend support before retrying')
  return enabled ? [...new Set([...before, name])] : before.filter(flag => flag !== name)
}

let tokenCounter = 0
let tokenOrigin = ''
const tokenReferences = new Map()
const tokenInventory = async () => {
  const origin = getApiURL()
  if (origin !== tokenOrigin) { tokenReferences.clear(); tokenOrigin = origin }
  const rows = await authAPI.tokens()
  check(Array.isArray(rows), 'Token inventory unavailable')
  const current = new Set(rows.map(row => row.Token))
  for (const [ref, raw] of tokenReferences) if (!current.has(raw)) tokenReferences.delete(ref)
  return rows.map(row => {
    let ref = [...tokenReferences].find(([, raw]) => raw === row.Token)?.[0]
    if (!ref) { ref = `token-ref-${++tokenCounter}`; tokenReferences.set(ref, row.Token) }
    return { reference: ref, ...pick(row, ['Name', 'Expire', 'ScopedPaths']) }
  })
}
const selectedToken = async input => {
  const rows = await tokenInventory()
  const found = rows.find(row => row.reference === input.reference)
  check(found, 'Token reference expired or is unavailable; refresh token metadata')
  return found
}
const authMeta = { sources: [source('api/Auth.js'), source('components/Auth/AuthTokenList.js')], menus: ['System > Auth'] }
const passkeys = async () => {
  const value = await api.get('/webauthn/status')
  check(Array.isArray(value?.Credentials), 'Passkey status unavailable')
  return value.Credentials.map(row => pick(row, ['ID', 'Name']))
}

const operations = [
  read('monitor.alerts.read', 'Read alert rules and current indices', empty, async () => redact(await alertsAPI.list()), alertMeta),
  write('monitor.alerts.add', 'Create an alert rule', object({ rule: object(alertFields, ['Name', 'TopicPrefix', 'Conditions', 'Actions']) }, ['rule']),
    async () => alertsAPI.list(), input => input.rule,
    async input => { await alertsAPI.add(input.rule); return { submitted: true } }, {
      ...alertMeta, verify: async (input, before) => {
        const rows = await alertsAPI.list()
        const canonical = value => JSON.stringify(value, (_, item) =>
          item && typeof item === 'object' && !Array.isArray(item)
            ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
        const expected = { MatchAnyOne: false, InvertRule: false, Disabled: false, ...input.rule,
          Actions: input.rule.Actions.map(action => {
            const next = { SendNotification: false, StoreAlert: false, GrabEvent: false, GrabValues: false, ...action }
            for (const key of ['MessageTitle', 'MessageBody']) if (next[key] === '') delete next[key]
            if (next.GrabFields?.length === 0) delete next.GrabFields
            return next
          }) }
        const added = Array.isArray(rows) ? rows[before.length] : null
        const { RuleId, ...stored } = added || {}
        const verified = Array.isArray(rows) && rows.length === before.length + 1 &&
          canonical(rows.slice(0, before.length)) === canonical(before) &&
          typeof RuleId === 'string' && RuleId.length > 0 && canonical(stored) === canonical(expected)
        return evidence(verified, 'Re-read appended alert and unchanged existing rules', added ? [added] : [])
      }
    }),
  write('monitor.alerts.update', 'Change an alert while preserving omitted fields',
    object({ index, changes: object(alertFields), actionIndex: index, actionChanges: alertAction }, ['index']),
    async () => alertsAPI.list(), alertPatch,
    async (input, context) => { await alertsAPI.update(input.index, alertPatch(input, context.before)); return { submitted: true } }, {
      ...alertMeta, verify: async (input, before) => {
        const rows = await alertsAPI.list()
        return evidence(equal(rows[input.index], alertPatch(input, before)), 'Re-read updated alert', rows[input.index])
      }
    }),
  write('monitor.alerts.remove', 'Delete one current alert rule', object({ index }, ['index']),
    async () => alertsAPI.list(), (input, before) => ({ action: 'delete_alert', rule: alertAt(before, input.index) }),
    async input => { await alertsAPI.remove(input.index); return { submitted: true } }, {
      ...alertMeta, verify: async (input, before) => {
        const rows = await alertsAPI.list()
        return evidence(equal(rows, before.filter((_, i) => i !== input.index)), 'Re-read alert inventory after deletion', rows)
      }
    }),
  read('monitor.events.buckets', 'List available event buckets and database configuration', empty,
    async () => ({ buckets: await dbAPI.buckets(), config: redact(await dbAPI.config()) }),
    { sources: [source('api/Db.js'), source('components/Logs/LogListDb.js')], menus: ['Monitor > Events'] }),
  read('monitor.events.query', 'Read one bounded event page with explicit time and field filters', object({
    bucket: text(), num: count(), min: text(), max: text(), strict: boolean(), filter: text(2000)
  }, ['bucket']), async input => {
    const buckets = await dbAPI.buckets()
    check(buckets.includes(input.bucket) && !/[/?#]/.test(input.bucket), 'Choose an exact current bucket')
    const { bucket, ...params } = input
    for (const value of [params.min, params.max].filter(Boolean)) check(Number.isFinite(Date.parse(value)) && /(Z|[+-]\d\d:\d\d)$/.test(value), 'Time bounds must be valid timestamps with an explicit timezone')
    if (params.min && params.max) check(Date.parse(params.min) <= Date.parse(params.max), 'The start time must not follow the end time')
    params.num = params.num || 50
    const page = await dbAPI.items(bucket, params)
    const rows = page === null ? [] : page
    check(Array.isArray(rows), 'Event query did not return a page')
    return { bucket, params, rows: redact(rows), pageCount: rows.length,
      mayHaveMore: rows.length >= params.num, bucketStats: redact(await dbAPI.stats(bucket)),
      countNote: 'Bucket KeyN and one page are not a count of all filtered events in the interval.' }
  }, { sources: [source('api/Db.js'), source('components/Logs/LogListDb.js')], menus: ['Monitor > Events', 'Monitor > Alerts'] }),
  read('monitor.notifications.read', 'Read current-session notification history', empty,
    async () => ({ entries: redact(getNotificationsLog()), scope: 'current UI session', maximumEntries: 50 }),
    { sources: [source('NotificationsLog.js')], menus: ['Monitor > Notifications'] }),
  write('monitor.notifications.clear', 'Clear only current-session notification history', empty,
    async () => clone(getNotificationsLog()), () => ({ action: 'clear_local_notifications', preserved: ['stored alerts', 'event database', 'alert delivery rules'] }),
    async () => { clearNotificationsLog(); return { cleared: true } }, {
      sources: [source('NotificationsLog.js')], menus: ['Monitor > Notifications'],
      verify: async () => evidence(getNotificationsLog().length === 0, 'Checked local notification history', { count: getNotificationsLog().length })
    }),
  read('monitor.tasks.read', 'Read PFW task configuration and managed WiFi interfaces', empty, async (_, context) => {
    taskGate(context)
    const config = await pfwAPI.getTaskConfig()
    try {
      const interfaces = await wifiAPI.iwDev()
      check(interfaces && typeof interfaces === 'object', 'WiFi interfaces unavailable')
      return { config, interfaces, interfacesStatus: 'available' }
    } catch (_) {
      return { config, interfaces: null, interfacesStatus: 'unavailable',
        interfacesError: 'WiFi interface inventory is unavailable. Task configuration was read successfully; scan eligibility remains unknown.' }
    }
  }, taskMeta),
  write('monitor.tasks.wifi_scan', 'Configure periodic WiFi scans preserving other tasks',
    object({ changes: object({ ...taskBase, Interfaces: array(text()) }) }, ['changes']),
    taskSnapshot, (input, before) => taskNext(before.WiFiScan, input.changes), async (input, context) => {
      taskGate(context)
      const next = taskNext(context.before.WiFiScan, input.changes)
      if (!next.Disabled) {
        const radios = await wifiAPI.iwDev()
        const managed = Object.values(radios).flatMap(interfaces => Object.entries(interfaces).filter(([, value]) => value.type === 'managed').map(([name]) => name))
        check(next.Interfaces?.length && next.Interfaces.every(name => managed.includes(name)), 'An enabled scan requires current managed interfaces')
      }
      await pfwAPI.saveWifiScanTask(next)
      return { submitted: true }
    }, { ...taskMeta, verify: async (input, before) => {
      const current = await pfwAPI.getTaskConfig()
      return evidence(equal(current.WiFiScan, taskNext(before.WiFiScan, input.changes)) && equal(current.UplinkCheck, before.UplinkCheck), 'Re-read both task configurations', current)
    } }),
  write('monitor.tasks.uplink_check', 'Configure uplink checks independently of WiFi scan settings',
    object({ changes: object({ ...taskBase, Addresses: array(string({ maxLength: 512, description: 'PFW target: ip:IPv4 or tcp:IPv4:port (1..65535). IPv4 literals only; hostnames and IPv6 are unsupported. At least one valid target is required even when disabled.' })) }) }, ['changes']),
    taskSnapshot, (input, before) => taskNext(before.UplinkCheck, input.changes), async (input, context) => {
      taskGate(context)
      const next = taskNext(context.before.UplinkCheck, input.changes)
      check(next.Addresses?.length, 'An uplink check requires a target, including when disabled')
      next.Addresses.forEach(address => {
        check(/^(ip:[^\s:]+|tcp:[^\s:]+:\d+)$/.test(address), 'Use ip:IPv4 or tcp:IPv4:port; TCP requires a port')
        const octets = address.split(':')[1].split('.')
        check(octets.length === 4 && octets.every(octet => /^(0|[1-9]\d{0,2})$/.test(octet) && Number(octet) <= 255), 'Uplink targets require an IPv4 literal, not a hostname')
        if (address.startsWith('tcp:')) { const port = Number(address.split(':').pop()); check(port >= 1 && port <= 65535, 'TCP port must be 1..65535') }
      })
      await pfwAPI.saveUplinkCheckTask(next)
      return { submitted: true }
    }, { ...taskMeta, verify: async (input, before) => {
      const current = await pfwAPI.getTaskConfig()
      return evidence(equal(current.UplinkCheck, taskNext(before.UplinkCheck, input.changes)) && equal(current.WiFiScan, before.WiFiScan), 'Re-read both task configurations; this does not prove a task ran', current)
    } }),
  read('system.info.read', 'Read hostname, uptime and installed versions', empty, async () => ({
    hostname: await api.get('/info/hostname'), uptime: await api.get('/info/uptime'), versions: await api.version()
  }), systemMeta),
  write('system.hostname.set', 'Change the SPR host name', object({ hostname: hostnameSchema }, ['hostname']),
    async () => api.get('/info/hostname'), input => input.hostname,
    async input => { check(/^[a-zA-Z0-9-]+$/.test(input.hostname), 'Invalid hostname'); await api.put('/info/hostname', input.hostname); return { submitted: true } },
    { ...systemMeta, verify: async input => { const hostname = await api.get('/info/hostname'); return evidence(hostname === input.hostname, 'Re-read host name', { hostname }) } }),
  read('system.time.read', 'Read router time and compare it with this browser', empty, async () => {
    const time = await api.get('/time')
    check(Number.isFinite(time?.unix), 'Router time is unavailable')
    return { routerUnix: time.unix, browserUnix: Math.floor(Date.now() / 1000), note: 'A mismatch alone does not establish which clock is wrong or NTP synchronization status.' }
  }, { ...systemMeta, sources: [source('components/System/TimeSync.js')] }),
  write('system.time.sync', 'Request the host to re-poll NTP', empty, async () => null,
    () => ({ action: 'request_time_sync' }), async () => { await api.put('/time/sync'); return { requested: true, note: 'A successful request does not prove synchronization.' } },
    { ...systemMeta, sources: [source('components/System/TimeSync.js')] }),
  read('system.backups.read', 'List configuration backup metadata', empty, async () => api.get('/backup'),
    { ...systemMeta, sources: [source('views/System/Configs.js')] }),
  write('system.backups.create', 'Create a configuration backup; it replaces an existing backup of the same SPR version', empty,
    async () => api.get('/backup'), (_, before) => ({ action: 'create_backup', existingBackups: before }),
    async () => ({ filename: await api.put('/backup') }), { ...systemMeta, sources: [source('views/System/Configs.js')],
      verify: async (_, before, result) => {
        const rows = await api.get('/backup')
        const found = rows.some(row => row.Name === result.filename)
        return evidence(found && before.every(old => rows.some(row => row.Name === old.Name)), 'Re-read backup filenames; archive integrity was not inspected', rows)
      }
    }),
  write('system.restart', 'Restart SPR after reviewing available configuration backups', empty,
    async () => {
      try { return { backups: await api.get('/backup'), backupInventoryAvailable: true } }
      catch (_) { return { backups: null, backupInventoryAvailable: false } }
    }, (_, before) => ({ action: 'restart_spr', ...before, hostReboot: false }),
    async () => { await api.restart(); return { requested: true, note: 'Restart requested; reconnect and read status to establish recovery.' } }, systemMeta),
  read('system.containers.read', 'Read container identity, image, state and network metadata', empty, async () => {
    const rows = await api.get('/info/docker')
    check(Array.isArray(rows), 'Container inventory unavailable')
    return rows.map(row => redact(pick(row, ['Id', 'ID', 'Name', 'Names', 'Image', 'State', 'Status', 'Created', 'NetworkSettings'])))
  }, { ...systemMeta, sources: [source('views/System/Docker.js')] }),
  read('system.services.status', 'Read current status of one SPR service', object({ service: enumValue(['dns', 'dhcp', 'wifid', 'mesh']) }, ['service']), async input => {
    const params = new URLSearchParams({ service: input.service })
    if (input.service === 'mesh') {
      const mesh = exactPlugin(await pluginAPI.list(), 'MESH')
      check(mesh.Enabled && mesh.ComposeFilePath, 'MESH must be uniquely configured and enabled')
      params.set('compose_file', mesh.ComposeFilePath)
    }
    const raw = await api.get(`/dockerPS?${params}`)
    const rows = typeof raw === 'string' ? raw.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : (Array.isArray(raw) ? raw : [raw])
    check(rows.length > 0 && rows.every(row => row && typeof row === 'object'), 'Service status unavailable')
    return { service: input.service, observedAt: new Date().toISOString(), containers: rows.map(row => pick(row, ['ID', 'Name', 'Names', 'Service', 'Image', 'State', 'Status', 'Health', 'ExitCode'])) }
  }, { sources: [source('views/Home.js')], menus: ['Home', 'System > System Info'] }),
  read('system.logs.read', 'Read bounded recent service logs', object({ container: text(), limit: count() }), async input => {
    const rows = await logsAPI.latest()
    check(Array.isArray(rows), 'Service logs unavailable')
    const selected = input.container ? rows.filter(row => row.CONTAINER_NAME === input.container) : rows
    return { rows: redact(selected.slice(0, input.limit || 50)), availableCount: selected.length, completeHistory: false }
  }, { ...systemMeta, sources: [source('api/Logs.js'), source('components/Logs/LogList.js')], menus: ['Home', 'System > System Info'] }),
  read('system.vms.read', 'Read VM inventory with capability and availability evidence', empty, async () => redact(await api.get('/info/vms')),
    { ...systemMeta, sources: [source('views/System/VirtualMachines.js')] }),
  read('system.neighbors.read', 'Compare observed ARP neighbors with registered device identities', empty, async () => ({
    neighbors: redact(await wifiAPI.arp()),
    devices: Object.values(await deviceAPI.list()).map(device => pick(device, ['Name', 'MAC', 'IP', 'RecentIP', 'Interface'])),
    note: 'An ARP observation can be stale; a matching address alone is not proof of device identity.'
  }), { ...systemMeta, sources: [source('views/Devices/Arp.js'), source('api/Wifi.js'), source('api/Device.js')] }),
  read('system.release.read', 'Read installed release and available release metadata', empty, async () => ({
    installed: await api.get('/release'), available: await api.get('/releasesAvailable?container=super_base')
  }), { ...systemMeta, sources: [source('components/System/Release.js')] }),
  read('system.plugins.read', 'Read plugin settings and UI-reported versions', empty, async () => {
    const plugins = await pluginAPI.list()
    check(Array.isArray(plugins), 'Plugin inventory unavailable')
    if (!plugins.length) return []
    const versionName = plugin => plugin.URI?.toLowerCase().startsWith('spr-') ? plugin.URI.toLowerCase() : (/^dns-(block|log)-extension$/.test(plugin.Name.toLowerCase()) ? 'superdns' : `super${plugin.Name.toLowerCase()}`)
    try {
      const names = [...new Set(plugins.map(versionName))]
      const response = await api.version(names)
      const versions = names.length === 1 && typeof response === 'string'
        ? { [names[0]]: response } : response
      check(versions && typeof versions === 'object' && !Array.isArray(versions), 'Plugin versions unavailable')
      return plugins.map(plugin => ({ ...safePlugin(plugin), Version: versions[versionName(plugin)] || 'none',
        VersionStatus: versions[versionName(plugin)] ? 'reported' : 'not_reported' }))
    } catch (_) {
      return plugins.map(plugin => ({ ...safePlugin(plugin), Version: null, VersionStatus: 'unavailable',
        VersionError: 'Plugin inventory was read successfully, but version lookup failed.' }))
    }
  }, pluginMeta),
  write('system.plugins.add', 'Add a plugin with explicit repository, sandbox and API scope settings',
    object({ plugin: object(pluginFields, ['Name', 'GitURL', 'Enabled', 'HasUI', 'SandboxedUI', 'ScopedPaths']) }, ['plugin']),
    async () => pluginAPI.list(), input => validatePlugin(input.plugin), async (input, context) => {
      check(!context.before.some(plugin => plugin.Name === input.plugin.Name), 'A plugin with this Name already exists')
      await pluginAPI.add(validatePlugin(input.plugin)); return { submitted: true }
    }, pluginMeta),
  write('system.plugins.update', 'Change plugin settings preserving omitted fields',
    object({ name: text(), changes: object(Object.fromEntries(Object.entries(pluginFields).filter(([key]) => key !== 'Name'))) }, ['name', 'changes']),
    async input => exactPlugin(await pluginAPI.list(), input.name), pluginPatch,
    async (input, context) => {
      const next = pluginPatch(input, context.before)
      if (next.Runtime === 'kvm' && context.before.Runtime !== 'kvm') {
        const inventory = await api.get('/info/vms')
        check(inventory?.KVMAvailable === true, 'Host KVM availability has not been established')
      }
      await pluginAPI.update(next); return { submitted: true }
    }, {
      ...pluginMeta, verify: async (input, before) => {
        const current = exactPlugin(await pluginAPI.list(), input.name)
        const expected = pluginPatch(input, before)
        return evidence(Object.keys(input.changes).every(key => equal(current[key], expected[key])), 'Re-read changed plugin fields', safePlugin(current))
      }
    }),
  write('system.plugins.remove', 'Remove one uniquely identified plugin', object({ name: text() }, ['name']),
    async input => exactPlugin(await pluginAPI.list(), input.name), (input, before) => {
      check(input.name === input.name.trim().toLowerCase(), 'The backend cannot delete this exact mixed-case or padded plugin Name; no removal was attempted')
      return { action: 'remove_plugin', plugin: safePlugin(before) }
    },
    async (input, context) => {
      check(input.name === input.name.trim().toLowerCase(), 'The backend cannot delete this exact mixed-case or padded plugin Name; no removal was attempted')
      await pluginAPI.remove(context.before); return { submitted: true }
    }, {
      ...pluginMeta, verify: async input => { const rows = await pluginAPI.list(); return evidence(!rows.some(row => row.Name === input.name), 'Re-read plugin inventory', { name: input.name }) }
    }),
  write('system.plugins.restart', 'Restart a plugin using its current image', object({ name: text() }, ['name']),
    async input => exactPlugin(await pluginAPI.list(), input.name), (_, before) => {
      check(before.Enabled === true && Boolean(before.ComposeFilePath), 'Plugin restart requires an enabled configured plugin with a compose file path')
      return { action: 'restart_plugin', plugin: safePlugin(before), updateImage: false }
    },
    async (input, context) => {
      check(context.before.Enabled === true && Boolean(context.before.ComposeFilePath), 'Plugin restart requires an enabled configured plugin with a compose file path')
      await pluginAPI.restart(input.name); return { requested: true, note: 'Read service/container status to establish recovery.' }
    }, pluginMeta),
  write('system.plugins.update_container', 'Update plugin source and configured container images', object({ name: text() }, ['name']),
    async input => {
      const plugins = await pluginAPI.list()
      const selected = exactPlugin(plugins, input.name)
      check(plugins.filter(plugin => plugin.Name.trim().toLowerCase() === input.name.trim().toLowerCase()).length === 1,
        'Plugin update requires one unambiguous backend name')
      return selected
    }, (_, before) => {
      check(before.Enabled === true && Boolean(before.ComposeFilePath), 'Plugin update requires an enabled configured plugin with a compose file path')
      return { action: 'update_plugin_container', plugin: safePlugin(before), updatesRepositorySource: Boolean(before.GitURL),
        pullsConfiguredImages: true, mayRecreateContainers: true, note: 'Updates source first when configured, then images from the resulting compose file. Does not establish health or newest-release status.' }
    }, async (input, context) => {
      check(context.before.Enabled === true && Boolean(context.before.ComposeFilePath), 'Plugin update requires an enabled configured plugin with a compose file path')
      const result = await pluginAPI.updateContainer(input.name)
      check(result && ['Updated', 'GitUpdated', 'ImageUpdated'].every(key => typeof result[key] === 'boolean'), 'Plugin update response was incomplete; outcome requires inspection')
      return { ...pick(result, ['Updated', 'GitUpdated', 'ImageUpdated']), note: 'Backend-reported update outcome only; runtime health and newest-release status were not checked.' }
    }, { ...pluginMeta, sources: [source('api/Plugin.js'), source('components/Plugins/PluginList.js'), 'api/code/plugins.go'],
      verify: async (_, before, result) => evidence(null, 'Backend reported source/image update flags; no independent health or latest-version verification', result)
    }),
  read('system.plugins.plus_status', 'Check PLUS token presence and activation without exposing the token', empty, async () => {
    const value = await pluginAPI.getPlusToken()
    if (!value) return { configured: false, valid: false }
    try { await pluginAPI.validPlusToken(); return { configured: true, valid: true } }
    catch (error) { return { configured: true, valid: false, status: error?.response?.status || error?.status || null, error: 'PLUS token validation failed; no token value is included.' } }
  }, pluginMeta),
  read('system.flags.read', 'Read current feature flags and supported flag names', empty,
    async () => ({ enabled: await featureFlagsAPI.list(), supported: ['rustap', 'webllm'] }), flagsMeta),
  write('system.flags.set', 'Set one feature flag preserving all other current flags',
    object({ name: enumValue(['rustap', 'webllm']), enabled: boolean() }, ['name', 'enabled']),
    async () => featureFlagsAPI.list(), flagsNext,
    async (input, context) => { await featureFlagsAPI.save(flagsNext(input, context.before)); return { submitted: true } }, {
      ...flagsMeta, verify: async (input, before) => { const flags = await featureFlagsAPI.list(); return evidence(equal([...flags].sort(), flagsNext(input, before).sort()), 'Re-read feature flags', flags) }
    }),
  read('system.auth.otp_status', 'Read OTP registration status without codes or seeds', empty,
    async () => pick(await authAPI.statusOTP(), ['State', 'Confirmed', 'AlwaysOn']), authMeta),
  read('system.auth.tokens', 'Read token metadata with opaque revocation references', empty, async () => tokenInventory(), authMeta),
  write('system.auth.token_create', 'Create an API token without placing its value in chat',
    object({ Name: text(), lifetimeSeconds: enumValue([3600, 86400, 2592000, 7776000, 31536000]), ScopedPaths: array(text()) }, ['Name', 'lifetimeSeconds', 'ScopedPaths']),
    async () => tokenInventory(), input => ({ action: 'create_api_token', ...input, expirationStartsAtApply: true }), async input => {
      const time = await api.get('/time')
      check(Number.isFinite(time?.unix), 'Router time is required to calculate token expiration')
      const Expire = Math.floor(time.unix) + input.lifetimeSeconds
      await authAPI.putToken(input.Name, Expire, input.ScopedPaths)
      return { created: true, Name: input.Name, Expire, ScopedPaths: input.ScopedPaths, tokenValue: '[kept out of chat; available in Auth UI]' }
    }, { ...authMeta, verify: async (input, before, result) => {
      const rows = await tokenInventory()
      const added = rows.filter(row => !before.some(old => old.reference === row.reference))
      return evidence(added.some(row => row.Name === input.Name && row.Expire === result.Expire && equal(row.ScopedPaths || [], input.ScopedPaths)), 'Re-read token metadata only', added)
    } }),
  write('system.auth.token_revoke', 'Revoke one token by its opaque reference', object({ reference: text() }, ['reference']),
    selectedToken, (_, before) => ({ action: 'revoke_token', tokenMetadata: before }), async input => {
      await selectedToken(input)
      const token = tokenReferences.get(input.reference)
      check(token, 'Token reference is unavailable')
      await authAPI.deleteToken(token)
      return { revoked: true, reference: input.reference }
    }, { ...authMeta, verify: async input => { const rows = await tokenInventory(); return evidence(!rows.some(row => row.reference === input.reference), 'Re-read token metadata', { reference: input.reference }) } }),
  read('system.auth.passkeys', 'Read passkey names and IDs', empty,
    async () => ({ supportedHere: isPasskeySupported(), passkeys: await passkeys() }),
    { ...authMeta, sources: [source('components/Auth/WebAuthn.js'), source('api/Passkey.js')] }),
  write('system.auth.passkey_remove', 'Remove one passkey by its credential ID', object({ ID: text() }, ['ID']),
    async () => passkeys(), (input, before) => { check(before.some(row => row.ID === input.ID), 'Passkey ID not found'); return { action: 'remove_passkey', passkey: before.find(row => row.ID === input.ID) } },
    async input => { await api.delete('/webauthn/credential', { ID: input.ID }); return { removed: true } }, {
      ...authMeta, sources: [source('components/Auth/WebAuthn.js')], verify: async (input, before) => {
        const rows = await passkeys()
        return evidence(!rows.some(row => row.ID === input.ID) && before.filter(row => row.ID !== input.ID).every(old => rows.some(row => row.ID === old.ID)), 'Re-read credentials and retained backup passkeys', rows)
      }
    }),
  read('system.auth.ssh_status', 'Read SSH public key setup and lock status', empty,
    async () => redact(await api.get('/authorizedKeys')), { ...authMeta, sources: [source('components/Auth/SSHKeys.js')] }),
  ui('system.auth.otp_setup', 'Set up or verify OTP in the secure Auth UI', '/admin/auth',
    'Use OTP Settings to scan the seed QR and enter the current code locally. Require For Login is applied only with a successful code verification. Keep seeds, codes and JWTs out of chat.',
    [source('components/Auth/OTPSettings.js')]),
  ui('system.auth.passkey_register', 'Register a passkey with the browser authenticator', '/admin/auth',
    'Use Add Passkey in a supported browser and complete the native authenticator ceremony. Unsupported platforms cannot register through this tool.',
    [source('api/Passkey.js'), source('components/Auth/WebAuthn.js')]),
  ui('system.auth.ssh_setup', 'Enter an initial SSH public key in Auth', '/admin/auth',
    'Paste public keys only into SSH Keys. Initial submission calls PUT /authorizedKeys with a string array. When Locked is true or the API returns 409, further edits require SSH; do not request a private key.',
    [source('components/Auth/SSHKeys.js')])
]

export default operations
