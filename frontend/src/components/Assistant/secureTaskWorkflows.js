import { api, wifiAPI, wireguardAPI, pfwAPI, firewallAPI, wanAPI, getApiURL } from 'api'
import { deviceAPI } from './assistantDeviceApi'
import { dyndnsAPI } from 'api/Dyndns'
import { Address4, Address6 } from 'ip-address'
import { object, string, integer, array, enumValue, validateInput } from './operationSchema'
import { cloneTask as clone, sameTaskState as same, need, rows, exact, deviceId, publicDevice, selectDevices,
  executeTaskSteps, taskReceipt } from './taskRuntime'

const sessions = new Map()
const origin = () => getApiURL()
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
const short = () => string({ minLength: 1, maxLength: 256 })
const field = (key, label, options = {}) => ({ key, label, ...options })
const fieldsMatch = (a, b) => a != null && Object.keys(b).every(k => same(a[k], b[k]))
const mask = value => Array.isArray(value) ? value.map(mask) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /password|privatekey|presharedkey|secret|login_token|email|username/i.test(k) ? (v ? '[set]' : '[empty]') : mask(v)])) : value
const deviceInventory = async () => {
  const value = await deviceAPI.list()
  need(value && typeof value === 'object' && !Array.isArray(value), 'Device inventory unavailable')
  return Object.values(value).map(publicDevice)
}
const allPeers = async () => {
  const value = await wireguardAPI.peers()
  need(value && typeof value === 'object', 'VPN peers unavailable')
  return Array.isArray(value) ? value : Object.values(value)
}
const peerConfig = p => ({ PublicKey: p.PublicKey, AllowedIPs: p.AllowedIPs })
const splitNames = text => String(text || '').split(',').map(s => s.trim()).filter(Boolean)
const address = (value, cidr = false) => {
  need(typeof value === 'string' && value.length > 0 && value.includes('/') === cidr, cidr ? 'Supply an explicit CIDR prefix' : 'Supply an IP address without a prefix')
  try { const parsed = value.includes(':') ? new Address6(value) : new Address4(value); return parsed }
  catch { throw new Error('Invalid network address') }
}
const endpoint = value => {
  need(typeof value === 'string' && /^(?:\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+):[0-9]{1,5}$/.test(value), 'Use a VPN hostname or IP with an explicit port, such as home.example:51820')
  const port = Number(value.slice(value.lastIndexOf(':') + 1))
  need(port > 0 && port < 65536, 'VPN endpoint port is outside the valid range')
  return value
}
const key = value => { need(/^[A-Za-z0-9+/]{43}=$/.test(value || ''), 'WireGuard keys must be 32-byte base64 values'); return value }
const hostname = value => {
  const name = String(value || '').trim().toLowerCase().replace(/\.$/, '')
  need(name.length > 0 && name.length <= 253 && name.split('.').every(p => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p)), 'Invalid DNS hostname')
  return name
}
const getSession = id => {
  const session = sessions.get(id)
  need(session && Date.now() - session.created < 30 * 60 * 1000, 'This setup expired; open a fresh setup form')
  need(session.origin === origin(), 'The selected router changed. Open a fresh setup form for that router.')
  return session
}
const interfaceSnapshot = async values => {
  const interfaces = await wifiAPI.interfacesConfiguration()
  const iface = exact(interfaces, i => i.Name === values.iface, 'interface')
  need(iface.Type !== 'AP', 'This interface is serving WiFi clients. Choose a separate station/uplink interface; the assistant will not disable your access point.')
  need(values.alternativeConnection === 'yes', 'Confirm a separate working management connection in the setup form before changing an uplink')
  return iface
}
const profiles = async (kind, collection) => rows((await api.get(`/uplink/${kind}`))?.[collection], `${kind} profiles`)
const selectProfile = (all, iface) => {
  const matches = all.filter(p => p.Iface === iface)
  need(matches.length <= 1, 'Duplicate uplink interface profiles')
  return matches[0] || null
}
const uplinkSnapshot = async (s, kind, collection) => ({ iface: await interfaceSnapshot(s.values), profiles: await profiles(kind, collection) })
const uplinkRun = async (s, context, kind, collection) => {
  const before = selectProfile(context.before.profiles, s.values.iface), after = context.after.profile
  return executeTaskSteps([{ label: `${kind === 'ppp' ? 'PPPoE' : 'Wireless'} uplink ${s.values.iface}`,
    before, after, read: async () => selectProfile(await profiles(kind, collection), s.values.iface),
    write: () => api.put(`/uplink/${kind}`, after),
    verify: async () => {
      const current = selectProfile(await profiles(kind, collection), s.values.iface)
      return fieldsMatch(current, after)
    } }])
}
const configuredUplink = async (s, context, kind, collection) => fieldsMatch(selectProfile(await profiles(kind, collection), s.values.iface), context.after.profile)

const definitions = {
  pppoe: {
    id: 'tasks.uplink.pppoe', label: 'Set up a PPPoE uplink', domain: 'network',
    description: 'Open a protected PPPoE setup for an exact interface. Code preserves existing profile fields, reviews the change, saves it and reads back configuration. ISP username/password stay in the form. A separate management connection is required.',
    schema: object({ iface: short() }),
    fields: [field('iface', 'Network interface'), field('username', 'ISP username', { secret: true }), field('password', 'ISP password', { secret: true }),
      field('vlan', 'ISP VLAN (optional; blank preserves existing)'), field('mtu', 'MTU (optional; blank preserves existing)'),
      field('alternativeConnection', 'I have a separate working connection to manage this router', { choices: ['no', 'yes'], defaultValue: 'no' })],
    snapshot: s => uplinkSnapshot(s, 'ppp', 'PPPs'),
    project: (s, before) => {
      const v = s.values, old = selectProfile(before.profiles, v.iface)
      const Username = v.username || old?.Username, Secret = v.password || old?.Secret
      need(Username && Secret, 'Enter the ISP username and password in this form')
      need(!/[\x00-\x1f\x7f"\\]/.test(Username + Secret), 'PPP credentials contain unsupported control, quote or backslash characters')
      if (v.vlan) need(/^\d+$/.test(v.vlan) && Number(v.vlan) >= 1 && Number(v.vlan) <= 4094, 'VLAN must be 1–4094')
      if (v.mtu) need(/^\d+$/.test(v.mtu) && Number(v.mtu) >= 576 && Number(v.mtu) <= 1500, 'MTU must be 576–1500')
      const profile = { ...(old || {}), Iface: v.iface, Enabled: true, Username, Secret, VLAN: v.vlan || old?.VLAN || '', MTU: v.mtu || old?.MTU || '' }
      delete profile.PPPIface
      return { profile, interfaceRole: 'Uplink', preservesOtherProfiles: true }
    },
    run: (s, context) => uplinkRun(s, context, 'ppp', 'PPPs'),
    configured: (s, context) => configuredUplink(s, context, 'ppp', 'PPPs')
  },
  wireless: {
    id: 'tasks.uplink.wireless', label: 'Set up a wireless uplink', domain: 'network',
    description: 'Open a protected WiFi uplink setup. Supply an exact interface and SSID when known. Code preserves backup profiles, refuses to repurpose an AP, and checks readback. Passwords stay outside chat; selecting an open network is explicit.',
    schema: object({ iface: short(), ssid: string({ minLength: 1, maxLength: 32 }) }),
    fields: [field('iface', 'Station/uplink interface'), field('ssid', 'WiFi network name (SSID)'),
      field('authentication', 'Authentication', { choices: ['WPA', 'open'], defaultValue: 'WPA' }), field('password', 'WiFi password', { secret: true }),
      field('bssid', 'Specific access point BSSID (optional)'),
      field('alternativeConnection', 'I have a separate working connection to manage this router', { choices: ['no', 'yes'], defaultValue: 'no' })],
    snapshot: s => uplinkSnapshot(s, 'wifi', 'WPAs'),
    project: (s, before) => {
      const v = s.values, old = selectProfile(before.profiles, v.iface)
      need(v.ssid && new TextEncoder().encode(v.ssid).length <= 32, 'SSID must be 1–32 bytes')
      if (v.bssid) need(/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(v.bssid), 'Invalid BSSID')
      const networks = old ? rows(old.Networks, 'Saved wireless networks') : []
      const matches = networks.filter(n => n.SSID === v.ssid && (!v.bssid || n.BSSID === v.bssid))
      need(matches.length <= 1, 'More than one saved profile matches this SSID; choose its BSSID')
      const selected = matches[0]
      need(['WPA', 'open'].includes(v.authentication), 'Choose WPA or explicitly choose an open network')
      const Password = v.authentication === 'open' ? '' : v.password || selected?.Password || ''
      if (v.authentication === 'WPA') need((Password.length >= 8 && Password.length <= 63 || /^[0-9a-fA-F]{64}$/.test(Password)) && !/[\x00-\x1f\x7f]/.test(Password), 'Enter a valid WPA password in this form')
      const next = { ...(selected || {}), SSID: v.ssid, Disabled: false, Password,
        KeyMgmt: v.authentication === 'open' ? 'NONE' : selected?.KeyMgmt && selected.KeyMgmt !== 'NONE' ? selected.KeyMgmt : 'WPA-PSK WPA-PSK-SHA256 SAE',
        ...(v.bssid ? { BSSID: v.bssid } : {}) }
      return { profile: { ...(old || {}), Iface: v.iface, Enabled: true, Networks: selected ? networks.map(n => n === selected ? next : n) : [...networks, next] },
        interfaceRole: 'Uplink', preservesOtherProfiles: true }
    },
    run: (s, context) => uplinkRun(s, context, 'wifi', 'WPAs'),
    configured: (s, context) => configuredUplink(s, context, 'wifi', 'WPAs')
  },
  ddns: {
    id: 'tasks.dyndns.setup', label: 'Set up Dynamic DNS', domain: 'dns',
    description: 'Set up a provider and one domain/subdomain through a protected form, preserving other domains and credentials. Code validates, reviews, saves, and checks provider/DNS observations separately. No token belongs in chat.',
    schema: object({ provider: short(), domain: short(), subdomain: short(), ipVersion: enumValue(['IPv4', 'IPv6']) }),
    fields: [field('provider', 'Provider supported by your installed GoDNS'), field('domain', 'Domain (for example example.com)'),
      field('subdomain', 'Subdomain (@ for the domain itself)'), field('ipVersion', 'IP version', { choices: ['IPv4', 'IPv6'], defaultValue: 'IPv4' }),
      field('email', 'Provider account/email (if required)', { secret: true }), field('password', 'Provider password/API key (if required)', { secret: true }),
      field('token', 'Provider login token (if required)', { secret: true }), field('ipURL', 'Public-IP lookup HTTPS URL (required for first setup)')],
    snapshot: () => dyndnsAPI.config(),
    project: (s, before) => {
      const v = s.values, domain = hostname(v.domain), subdomain = v.subdomain === '@' ? '@' : hostname(v.subdomain)
      const provider = v.provider || before.provider
      need(provider && /^[:/\-=@A-Za-z0-9.]+$/.test(provider), 'Enter a valid installed provider name')
      need(!before.provider || before.provider === provider, 'Changing an existing provider affects all its domains. Use provider migration controls for that change.')
      const domains = rows(before.domains, 'Dynamic DNS domains')
      const matches = domains.filter(d => d.domain_name === domain)
      need(matches.length <= 1, 'Duplicate Dynamic DNS domain')
      const entry = matches[0] ? { ...matches[0], sub_domains: [...new Set([...rows(matches[0].sub_domains, 'Subdomains'), subdomain])] } : { domain_name: domain, sub_domains: [subdomain] }
      let urls = rows(before.ip_urls, 'Public-IP lookup URLs')
      if (v.ipURL) {
        const parsed = new URL(v.ipURL)
        need(parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash && /^[:/\-=@A-Za-z0-9.]+$/.test(v.ipURL), 'Use an HTTPS lookup URL without credentials, query parameters or fragment')
        urls = [...new Set([...urls, v.ipURL])]
      }
      need(urls.length, 'Enter a public-IP lookup URL for first setup')
      need(['IPv4', 'IPv6'].includes(v.ipVersion), 'Choose IPv4 or IPv6')
      const after = { ...before, provider, ip_type: v.ipVersion, ip_urls: urls,
        interval: before.interval > 0 ? before.interval : 300,
        domains: matches.length ? domains.map(d => d === matches[0] ? entry : d) : [...domains, entry] }
      if (v.email) after.email = v.email
      if (v.password) after.password = v.password
      if (v.token) after.login_token = v.token
      need(after.password || after.login_token, 'Enter provider credentials in this form')
      return after
    },
    run: async (s, context) => executeTaskSteps([{ label: 'Dynamic DNS configuration', before: context.before, after: context.after,
      read: () => dyndnsAPI.config(), write: () => dyndnsAPI.setConfig(context.after),
      verify: async () => fieldsMatch(await dyndnsAPI.config(), context.after) }]),
    configured: async (s, context) => fieldsMatch(await dyndnsAPI.config(), context.after)
  },
  vpn: {
    id: 'tasks.vpn.setup', label: 'Set up a remote-access VPN', domain: 'network',
    description: 'Create a new WireGuard client with keys kept in the setup form. User selects Internet-only or exact home-device service access; code allocates the peer, assigns policies, scopes service grants, and supplies its private configuration/QR. An observed handshake is a separate check.',
    schema: object({ name: short(), mode: enumValue(['internet', 'home_service']), devices: array(short(), { minItems: 1, maxItems: 64, uniqueItems: true }),
      protocol: enumValue(['tcp', 'udp']), port: integer({ minimum: 1, maximum: 65535 }) }),
    fields: [field('name', 'Name for the new VPN client'), field('endpoint', 'Home VPN hostname/IP and port'),
      field('mode', 'What should this VPN client access?', { choices: ['internet', 'home_service'] }),
      field('devices', 'Home device names, comma separated (home service only)'),
      field('protocol', 'Home service protocol', { choices: ['tcp', 'udp'], defaultValue: 'tcp' }), field('port', 'Home service port (home service only)')],
    snapshot: async s => ({ peers: (await allPeers()).map(peerConfig), devices: await deviceInventory(),
      endpoints: rows((await firewallAPI.config()).Endpoints, 'Service endpoints'), status: await wireguardAPI.status() }),
    project: (s, before) => {
      const v = s.values
      need(v.name?.trim(), 'Name the new VPN client')
      need(!before.devices.some(d => d.Name === v.name), 'A device already has that name; choose a distinct name for the new VPN client')
      need(before.status?.wg0?.listenPort, 'The WireGuard listener is unavailable; enable it in VPN settings first')
      endpoint(v.endpoint)
      key(s.keyPair.PublicKey)
      need(!before.peers.some(p => p.PublicKey === s.keyPair.PublicKey), 'Generated peer identity already exists')
      need(['internet', 'home_service'].includes(v.mode), 'Choose the VPN access scope')
      const targets = v.mode === 'home_service' ? selectDevices(before.devices, splitNames(v.devices)) : []
      if (v.mode === 'home_service') {
        need(targets.length && ['tcp', 'udp'].includes(v.protocol) && /^\d+$/.test(v.port) && Number(v.port) > 0 && Number(v.port) < 65536, 'Choose home devices and an exact protocol/port')
        targets.forEach(d => { address(d.RecentIP); need(before.devices.filter(x => x.RecentIP === d.RecentIP).length === 1, 'Home device IP is ambiguous') })
      }
      return { publicKey: s.keyPair.PublicKey, name: v.name, endpoint: v.endpoint,
        policies: v.mode === 'internet' ? ['dns', 'wan'] : ['dns'], mode: v.mode,
        targets: targets.map(d => ({ identity: deviceId(d), IP: d.RecentIP, protocol: v.protocol, port: v.port })) }
    },
    run: async (s, context) => {
      const after = context.after, steps = []
      try {
        const config = await wireguardAPI.putPeer({ PublicKey: after.publicKey, AllowedIPs: '', Endpoint: after.endpoint })
        need(config?.Interface?.Address && config?.Peer, 'VPN response omitted the client configuration')
        config.Interface.PrivateKey = s.keyPair.PrivateKey
        s.artifact = config
        steps.push({ step: 'WireGuard peer', status: 'accepted' })
        await deviceAPI.update(after.publicKey, { Name: after.name, Policies: after.policies })
        steps.push({ step: 'VPN device permissions', status: 'accepted' })
        if (after.mode === 'home_service') {
          const tag = `spr:vpn:${after.publicKey}`
          need(!(await deviceInventory()).some(d => deviceId(d) !== after.publicKey && rows(d.DeviceTags, 'Device tags').includes(tag)), 'VPN scope tag is already used')
          await deviceAPI.update(after.publicKey, { DeviceTags: [tag] })
          for (const target of after.targets) {
            await firewallAPI.addEndpoint({ RuleName: `VPN ${after.publicKey} ${target.identity}`, Description: 'Scoped VPN client service',
              Protocol: target.protocol, IP: target.IP, Port: target.port, Tags: [tag] })
            steps.push({ step: `Home service ${target.IP}:${target.port}`, status: 'accepted' })
          }
          const dnsIPs = splitNames(config.Interface.DNS)
          const destinations = [...new Set([...after.targets.map(t => t.IP), ...dnsIPs])]
          destinations.forEach(value => address(value))
          config.Peer.AllowedIPs = destinations.map(value => `${value}/${value.includes(':') ? 128 : 32}`).join(', ')
        }
        return { complete: true, steps, remaining: 0 }
      } catch { return { complete: false, steps: [...steps, { step: 'VPN setup', status: 'outcome_unknown' }], remaining: null } }
    },
    configured: async (s, context) => {
      const wanted = context.after, peers = await allPeers(), all = await deviceInventory()
      const d = all.find(d => d.WGPubKey === wanted.publicKey || deviceId(d) === wanted.publicKey)
      if (!peers.some(p => p.PublicKey === wanted.publicKey) || !d || d.Name !== wanted.name || !same(d.Policies, wanted.policies)) return false
      if (wanted.mode === 'home_service') {
        const endpoints = rows((await firewallAPI.config()).Endpoints, 'Service endpoints'), tag = `spr:vpn:${wanted.publicKey}`
        return rows(d.DeviceTags, 'VPN tags').includes(tag) && wanted.targets.every(t => endpoints.some(r => !r.Disabled && r.IP === t.IP && r.Protocol === t.protocol && r.Port === t.port && same(r.Tags, [tag])))
      }
      return true
    }
  },
  site_vpn: {
    id: 'tasks.vpn.site', label: 'Set up a provider or site VPN and its routes', domain: 'network',
    description: 'Import WireGuard provider/site keys in a protected form, select source devices and an explicit destination CIDR. Code creates the site and narrow device routes under one review. No default route is inferred. Requires PLUS/PFW.',
    schema: object({ destination: short(), devices: array(short(), { minItems: 1, maxItems: 64, uniqueItems: true }) }),
    fields: [field('devices', 'Source device names, comma separated'), field('destination', 'Destination CIDR (0.0.0.0/0 only if all IPv4 traffic is intended)'),
      field('address', 'Tunnel interface address from the provider'), field('endpoint', 'Remote hostname/IP and port'),
      field('peerPublicKey', 'Remote public key'), field('privateKey', 'Tunnel private key', { secret: true }),
      field('presharedKey', 'Preshared key (optional)', { secret: true }), field('dns', 'VPN DNS server IP (optional)')],
    snapshot: async (s, context) => {
      need(context.isPlusDisabled === false, 'Provider/site routing requires confirmed PLUS/PFW availability')
      return { config: await pfwAPI.config(), devices: await deviceInventory() }
    },
    project: (s, before) => {
      const v = s.values, sources = selectDevices(before.devices, splitNames(v.devices))
      need(sources.length, 'Select devices to use the tunnel')
      address(v.destination, true); address(v.address, v.address.includes('/')); endpoint(v.endpoint); key(v.peerPublicKey); key(v.privateKey)
      if (v.presharedKey) key(v.presharedKey)
      if (v.dns) address(v.dns)
      const sites = rows(before.config.SiteVPNs, 'Site VPNs'), routes = rows(before.config.ForwardingRules, 'PFW routes')
      need(!sites.some(site => site.PeerPublicKey === v.peerPublicKey && site.Endpoint === v.endpoint), 'This VPN site already exists; select its existing route controls instead of duplicating it')
      const site = { Address: v.address, PeerPublicKey: v.peerPublicKey, PrivateKey: v.privateKey, PresharedKey: v.presharedKey || '', Endpoint: v.endpoint, DNS: v.dns || '' }
      const iface = `site${sites.length}`
      const additions = sources.map(d => ({ RuleName: `VPN route ${deviceId(d)} via ${iface}`, Disabled: false, Expiration: 0,
        Client: { Identity: deviceId(d), SrcIP: '', Group: '', Tag: '' }, OriginalDst: { IP: v.destination, Domain: '' }, Dst: { IP: '', Domain: '' },
        DstInterface: iface, Protocol: '', OriginalDstPort: '', DstPort: '', Condition: '', Time: { Days: [0, 0, 0, 0, 0, 0, 0], Start: '', End: '', CronExpr: '' } }))
      need(!routes.some(r => additions.some(a => r.RuleName === a.RuleName)), 'A conflicting route already exists')
      return { sites: [...sites, site], routes: [...routes, ...additions], interface: iface, devices: sources.map(deviceId) }
    },
    run: async (s, context) => {
      const before = context.before.config, after = context.after
      const steps = [{ label: 'VPN tunnel', before: rows(before.SiteVPNs, 'Site VPNs'), after: after.sites,
        read: async () => rows((await pfwAPI.config()).SiteVPNs, 'Site VPNs'), write: () => pfwAPI.addSiteVPN(after.sites[after.sites.length - 1]),
        verify: async () => {
          const current = rows((await pfwAPI.config()).SiteVPNs, 'Site VPNs')
          return current.length === after.sites.length && same(current.slice(0, -1), after.sites.slice(0, -1)) && fieldsMatch(current.at(-1), after.sites.at(-1))
        } }]
      let prior = rows(before.ForwardingRules, 'PFW routes')
      for (const route of after.routes.slice(prior.length)) {
        const next = [...prior, route]
        steps.push({ label: route.RuleName, before: prior, after: next, read: async () => rows((await pfwAPI.config()).ForwardingRules, 'PFW routes'), write: () => pfwAPI.addForward(route) })
        prior = next
      }
      return executeTaskSteps(steps)
    },
    configured: async (s, context) => {
      const current = await pfwAPI.config()
      const sites = rows(current.SiteVPNs, 'Site VPNs'), expected = context.after.sites
      return sites.length === expected.length && same(sites.slice(0, -1), expected.slice(0, -1)) && fieldsMatch(sites.at(-1), expected.at(-1)) && same(current.ForwardingRules, context.after.routes)
    }
  }
}

export const secureTaskOperations = Object.entries(definitions).map(([kind, definition]) => ({
  id: definition.id, label: definition.label, description: definition.description, schema: definition.schema,
  requiredOperation: kind === 'ddns' ? 'dns.dyndns.read' : 'network.devices.read',
  domain: 'tasks', relatedDomains: [definition.domain], kind: 'ui', task: true, managedWorkflow: kind,
  route: '/admin/assistant', instructions: 'Complete the protected setup form, review the proposed configuration, then check its result.',
  menus: ['AI Assistant', 'Network > Link Settings', 'Network > VPN', 'DNS > Dynamic DNS'],
  sources: ['frontend/src/components/Assistant/secureTaskWorkflows.js', 'api/code/uplink.go', 'wireguard/code/wireguard_plugin.go', 'frontend/src/components/Wireguard/SiteVPN.js']
}))

export const beginSecureTask = async (operationId, input = {}) => {
  const initialOrigin = origin()
  const entry = Object.entries(definitions).find(([, spec]) => spec.id === operationId)
  need(entry, 'Unknown protected setup task')
  const [kind, spec] = entry
  validateInput(input, spec.schema)
  const id = uid(), fields = spec.fields.map(f => {
    const value = input[f.key] ?? f.defaultValue ?? ''
    return { ...f, defaultValue: Array.isArray(value) ? value.join(', ') : String(value) }
  })
  if (kind === 'pppoe' || kind === 'wireless') {
    const interfaces = await wifiAPI.interfacesConfiguration()
    const names = rows(interfaces, 'Interfaces').filter(i => i.Type !== 'AP').map(i => i.Name)
    fields.find(f => f.key === 'iface').choices = names
  }
  need(initialOrigin === origin(), 'Router changed while opening setup. Start again.')
  const workflow = { id, operation: operationId, label: spec.label, managed: true, route: '/admin/assistant', fields,
    instructions: 'Set up the selected feature here. Credentials stay in this form and are never sent to the model.', applied: false }
  if (sessions.size >= 16) sessions.delete(sessions.keys().next().value)
  sessions.set(id, { kind, spec, input: clone(input), workflow: clone(workflow), origin: initialOrigin, created: Date.now(), values: null })
  return workflow
}

export const stageSecureTask = async (workflow, values) => {
  const s = getSession(workflow.id)
  need(same(workflow, s.workflow), 'The setup form changed; open a fresh one')
  need(!s.appliedAt, 'This setup was already sent. Check its result; do not retry an uncertain creation.')
  validateInput(values, object(Object.fromEntries(s.spec.fields.map(f => [f.key, string({ maxLength: 4096 })])), s.spec.fields.map(f => f.key)))
  s.values = clone(values)
  s.revision = (s.revision || 0) + 1
  if (s.kind === 'vpn' && !s.keyPair) {
    s.keyPair = await wireguardAPI.genKey()
    key(s.keyPair?.PrivateKey); key(s.keyPair?.PublicKey)
  }
  return { operationId: 'tasks.secure.apply', input: { sessionId: workflow.id, revision: s.revision } }
}
export const discardSecureTask = id => sessions.delete(id)
export const secureTaskArtifact = id => getSession(id).artifact || null
const staged = input => {
  const s = getSession(input.sessionId)
  need(s.revision === input.revision && s.values, 'The protected form changed after review; prepare it again')
  return s
}
export const secureApplyOperation = {
  id: 'tasks.secure.apply', domain: 'tasks', kind: 'write', task: true, internal: true,
  label: 'Protected setup', description: 'Internal review action; only a protected form can stage it.',
  schema: object({ sessionId: short(), revision: integer({ minimum: 1 }) }, ['sessionId', 'revision']), menus: ['AI Assistant'], sources: ['frontend/src/components/Assistant/secureTaskWorkflows.js'],
  snapshot: (input, context) => staged(input).spec.snapshot(staged(input), context),
  project: (input, before, context) => staged(input).spec.project(staged(input), before, context),
  redact: mask,
  run: async (input, context) => {
    const s = staged(input)
    s.context = clone({ before: context.before, after: context.after })
    s.appliedAt = Date.now()
    return s.spec.run(s, context)
  },
  verify: async (input, before, result, context) => {
    const s = getSession(input.sessionId)
    const confirmed = result.complete && await s.spec.configured(s, s.context)
    s.configured = confirmed
    s.values = Object.fromEntries(Object.entries(s.values).filter(([k]) => !s.spec.fields.find(f => f.key === k)?.secret))
    s.keyPair = s.keyPair ? { PublicKey: s.keyPair.PublicKey } : undefined
    return { verified: Boolean(confirmed), summary: confirmed
      ? `${s.spec.label}: configuration was saved and read back. Use Check connection for operational evidence.`
      : 'Setup did not finish with confirmed readback. Review the individual steps; do not repeat an uncertain creation.', data: { steps: result.steps, connectionVerified: false } }
  }
}

export const checkSecureTask = async id => {
  const s = getSession(id)
  need(s.context, 'Apply the reviewed setup before checking its result')
  if (!await s.spec.configured(s, s.context)) return taskReceipt('incomplete', 'The requested configuration is not confirmed by current readback.', { applied: true })
  if (s.kind === 'vpn' || s.kind === 'site_vpn') {
    const publicKey = s.kind === 'vpn' ? s.context.after.publicKey : s.context.after.sites.at(-1).PeerPublicKey
    const sitePeers = async () => Object.values(await wireguardAPI.status()).flatMap(iface => Object.entries(iface.peers || iface.Peers || {}).map(([key, peer]) => ({ ...peer, PublicKey: peer?.PublicKey || key })))
    const peers = s.kind === 'vpn' ? await allPeers() : await sitePeers()
    const peer = peers.find(p => p.PublicKey === publicKey || p.publicKey === publicKey)
    const handshake = Number(peer?.LatestHandshake || peer?.latestHandshake || peer?.lastHandshakeTime || 0)
    const recent = handshake > 0 && handshake * 1000 >= s.appliedAt && Date.now() - handshake * 1000 < 180000
    return taskReceipt(recent ? 'connection_observed' : 'configured', recent
      ? 'A recent VPN handshake was observed for this peer. Application access still requires a client-side check.'
      : 'VPN configuration is saved. Connect the client or remote peer, then check again; no recent handshake has been confirmed.', { applied: true, handshakeObserved: recent })
  }
  if (s.kind === 'ddns') {
    return taskReceipt('configured', 'Dynamic DNS configuration is saved. Whether the record has been published is not checked here.', { applied: true })
  }
  const all = await wifiAPI.ipAddr()
  const profile = selectProfile(await profiles(s.kind === 'pppoe' ? 'ppp' : 'wifi', s.kind === 'pppoe' ? 'PPPs' : 'WPAs'), s.values.iface)
  const iface = s.kind === 'pppoe' ? profile?.PPPIface : s.values.iface
  const observed = rows(all, 'Interface addresses').find(i => i.ifname === iface)
  const assigned = rows(observed?.addr_info ?? null, 'Assigned addresses').filter(a => a.scope === 'global').map(a => a.local)
  let healthy = false
  try {
    const samples = rows(await wanAPI.history(iface, 'minutes', 3), 'WAN probe samples')
    healthy = samples.some(sample => sample.Up === true && sample.Time * 1000 >= s.appliedAt && Date.now() - sample.Time * 1000 < 180000 && sample.LossPct === 0)
  } catch { }
  return taskReceipt(healthy ? 'connection_observed' : 'configured', healthy
    ? `Recent WAN probes succeeded through ${iface}. This establishes reachability to the configured probe targets, not every Internet service${s.kind === 'wireless' ? ' or association to the requested SSID' : ''}.`
    : assigned.length
    ? `Configuration is saved; ${iface} currently has an address. Internet reachability${s.kind === 'wireless' ? ' and association to the requested SSID' : ''} have not been proven.`
    : 'Configuration is saved, but no address on the selected uplink has been observed yet. Check the ISP or wireless credentials and link.', { applied: true, interface: iface, addresses: assigned, probeObserved: healthy })
}
