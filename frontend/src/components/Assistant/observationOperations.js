import { getApiURL } from 'api'
import { Address4, Address6 } from 'ip-address'
import { object, string, integer, validateInput } from './operationSchema'

const ref = () => string({ minLength: 1, maxLength: 256, description: 'Exact device name, MAC or WireGuard public key. Code resolves it; do not invent an IP.' })
const requireData = (ok, message) => { if (!ok) throw new Error(message) }
const list = (value, label) => {
  requireData(value === null || Array.isArray(value), `${label} unavailable`)
  return value || []
}
const identity = d => d.MAC || d.WGPubKey
const select = (devices, value) => {
  const matches = devices.filter(d => d.Name?.toLowerCase() === value.toLowerCase() ||
    d.MAC?.toLowerCase() === value.toLowerCase() || d.WGPubKey === value)
  requireData(matches.length === 1, matches.length ? 'Several devices match. Ask for the exact MAC or WireGuard public key.' : 'No matching device was found. Ask for the name shown in Devices.')
  requireData(identity(matches[0]), 'The matching device has no usable identity')
  return matches[0]
}
const publicDevice = d => Object.fromEntries(['Name', 'MAC', 'WGPubKey', 'RecentIP', 'Policies', 'Groups', 'DeviceTags', 'WiFiAuthType'].filter(k => d[k] !== undefined).map(k => [k, d[k]]))
const inAddress = (ip, rule) => {
  try {
    if (typeof ip !== 'string' || typeof rule !== 'string' || ip.includes(':') !== rule.includes(':')) return false
    const Address = ip.includes(':') ? Address6 : Address4
    return new Address(ip).isInSubnet(new Address(rule))
  } catch { return false }
}
const publicRules = rules => rules.map(r => Object.fromEntries(['RuleName', 'Protocol', 'SrcIP', 'DstIP', 'SrcPort', 'DstPort', 'IP', 'Port', 'Tags', 'Disabled'].filter(k => r[k] !== undefined).map(k => [k, r[k]])))

export const createObservationOperations = baseOperations => {
  const base = new Map(baseOperations.map(s => [s.id, s]))
  const read = async (id, input = {}) => {
    const spec = base.get(id)
    requireData(spec?.kind === 'read', `Read capability unavailable: ${id}`)
    validateInput(input, spec.schema)
    return spec.run(input)
  }
  const inventory = async () => list(await read('devices.list'), 'Device inventory')
  const optional = async (id, input) => {
    try { return { status: 'observed', data: await read(id, input) } }
    catch { return { status: 'unavailable', data: null } }
  }
  const spec = (id, label, description, schema, dependencies, run) => ({
    id, domain: id.split('.')[0], kind: 'read', label, description, schema, dependencies,
    menus: ['AI Assistant'], sources: ['frontend/src/components/Assistant/observationOperations.js', ...dependencies.flatMap(id => base.get(id)?.sources || [])],
    run: async input => {
      const origin = typeof getApiURL === 'function' ? getApiURL() : null
      const result = await run(input)
      requireData(origin === (typeof getApiURL === 'function' ? getApiURL() : null), 'The selected router changed during the read. Request fresh information.')
      return { ...result, observedAt: new Date().toISOString(), applied: false }
    }
  })
  return [
    spec('devices.inspect', 'Inspect one device and its current configuration',
      'Read a named device’s groups, policies, tags, WiFi authentication type (sae = WPA3, or wpa2), last assigned IP and observed connection status. Answer the user’s question from these facts. A saved IP or wan policy does not prove online status.',
      object({ device: ref() }, ['device']), ['devices.list', 'network.topology.read'], async ({ device }) => {
        const selected = select(await inventory(), device)
        const topology = await optional('network.topology.read')
        const t = topology.data, generated = Date.parse(t?.GeneratedAt)
        const fresh = Number.isFinite(generated) && Date.now() - generated <= 120000 && generated - Date.now() <= 60000
        const nodes = Array.isArray(t?.Nodes) ? t.Nodes.filter(n => n.Kind === 'device' &&
          (selected.MAC ? n.MAC?.toLowerCase() === selected.MAC.toLowerCase() : n.ID === `dev:${selected.WGPubKey}`)) : []
        const node = nodes.length === 1 ? nodes[0] : null
        const known = topology.status === 'observed' && fresh && typeof node?.Online === 'boolean'
        return { device: publicDevice(selected), connection: {
          status: known ? node.Online ? 'reported_connected' : 'not_observed_connected' : 'unknown',
          ...(known ? { connectionType: node.ConnType, interface: node.Iface, sourceTime: t.GeneratedAt } : {}),
          meaning: 'SPR topology observation, not an Internet probe. Absence of a connection observation does not prove the device is powered off.'
        }, incomplete: !known, missingConfigurationFields: ['Policies', 'Groups', 'DeviceTags'].filter(k => selected[k] === undefined) }
      }),
    spec('devices.access', 'Inspect directional access grants between devices',
      'Supply source and destination for a pair; destination alone lists candidate incoming grants, source alone lists outgoing grants. Code resolves names and checks directional lan, enabled shared groups and IP/tag service endpoints. Report candidate grants with their scope; this is not a live connection test or a complete firewall verdict.',
      object({ source: ref(), destination: ref() }, [], { anyOf: [{ required: ['source'] }, { required: ['destination'] }] }),
      ['devices.list', 'network.groups.read', 'firewall.config', 'network.pfw.read'], async input => {
        requireData(input.source || input.destination, 'Supply a source or destination device before inspecting access.')
        const all = await inventory(), source = input.source ? select(all, input.source) : null,
          destination = input.destination ? select(all, input.destination) : null
        const [groups, firewall, pfw] = await Promise.all([optional('network.groups.read'), optional('firewall.config'), optional('network.pfw.read')])
        const groupRows = Array.isArray(groups.data) ? groups.data : []
        const endpoints = Array.isArray(firewall.data?.Endpoints) ? firewall.data.Endpoints : []
        const blocks = Array.isArray(firewall.data?.ForwardingBlockRules) ? firewall.data.ForwardingBlockRules : []
        const candidates = [], sourceDevices = source ? [source] : all, destinations = destination ? [destination] : all
        for (const from of sourceDevices) for (const to of destinations) {
          if (identity(from) === identity(to)) continue
          const grants = []
          if (from.Policies?.includes('lan')) grants.push({ kind: 'source_lan_policy', scope: 'broad directional LAN access' })
          for (const name of from.Groups || []) if (to.Groups?.includes(name)) {
            const records = groupRows.filter(g => g.Name === name)
            if (records.length === 1 && records[0].Disabled === false) grants.push({ kind: 'shared_enabled_group', name, scope: 'both directions' })
          }
          const matching = endpoints.filter(e => !e.Domain && inAddress(to.RecentIP, e.IP) && e.Tags?.some(t => from.DeviceTags?.includes(t)))
          grants.push(...publicRules(matching).map(rule => ({ kind: 'tag_scoped_service', rule })))
          const matchingBlocks = blocks.filter(b => inAddress(from.RecentIP, b.SrcIP) && inAddress(to.RecentIP, b.DstIP))
          if (grants.length || source && destination) candidates.push({ source: publicDevice(from), destination: publicDevice(to),
            grantCandidates: grants, matchingForwardBlocks: publicRules(matchingBlocks) })
        }
        return { candidates: candidates.slice(0, 40), totalCandidates: candidates.length, truncated: candidates.length > 40,
          incomplete: groups.status !== 'observed' || firewall.status !== 'observed' || pfw.status !== 'observed',
          sources: { groups: groups.status, firewall: firewall.status, programmableFirewall: pfw.status },
          effectiveReachability: 'not_determined', liveConnectivity: 'not_tested',
          limitations: 'Grant candidates may be restricted by forwarding blocks, quarantine, schedules, routes or plugin rules. No candidate is not proof of denial. Shared tags and similar IP prefixes alone grant nothing. Service-group destinations and programmable rules need further inspection.',
          followUpOperations: ['network.groups.read', 'firewall.config', 'network.pfw.read'] }
      }),
    spec('network.traffic.inspect', 'Inspect recent traffic for a named device or the network',
      'Read traffic for an explicit number of minutes, optionally scoped to an exact device. Resolves a unique current IP, checks collection settings and reports retention limits. Destination aggregates are not page contents or proof of malicious activity.',
      object({ minutes: integer({ minimum: 1, maximum: 10080 }), device: ref() }, ['minutes']),
      ['devices.list', 'network.traffic.collection.config', 'network.traffic.insights.overview', 'network.traffic.insights.device'], async input => {
        let selected, data
        const collection = await optional('network.traffic.collection.config')
        if (input.device) {
          const all = await inventory(); selected = select(all, input.device)
          requireData(selected.RecentIP && all.filter(d => d.RecentIP === selected.RecentIP).length === 1, 'Device IP is missing or shared. Resolve the current device address before attributing traffic.')
          data = await read('network.traffic.insights.device', { ip: selected.RecentIP, minutes: input.minutes })
        } else data = await read('network.traffic.insights.overview', { minutes: input.minutes })
        return { requestedMinutes: input.minutes, ...(selected ? { device: publicDevice(selected) } : {}), data,
          collection, incomplete: collection.status !== 'observed' || collection.data?.Enabled !== true,
          coverage: 'Historical collection continuity is not proven. SPR aggregates hourly buckets, so short windows can include earlier activity in the same bucket. Missing data is not zero traffic. IP-based history may include an earlier owner of that address.',
          privacy: 'Domains and destination IPs do not reveal full HTTPS URLs, page contents or the person responsible.' }
      }),
    spec('system.plugins.status', 'Inspect plugin configuration and running containers',
      'Read installed/enabled plugins and current container states together. Enabled or a version string does not prove running or healthy. Container names are evidence, not a guaranteed mapping to plugins; say when runtime mapping is unverified.',
      object({}), ['system.plugins.read', 'system.containers.read'], async () => {
        const [plugins, containers] = await Promise.all([optional('system.plugins.read'), optional('system.containers.read')])
        return { plugins, containers, incomplete: plugins.status !== 'observed' || containers.status !== 'observed',
          runtimeMapping: 'unverified', meaning: 'Report Enabled as configuration, State/Status as container observations. Do not infer plugin health from Enabled or Version, or guess a container-to-plugin mapping.' }
      })
  ].filter(s => s.dependencies.every(id => base.has(id)))
}
