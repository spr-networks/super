import { array, enumValue, object, string } from './operationSchema'

export const TASK_INTERFACE_VERSION = 3
export const cloneTask = value => JSON.parse(JSON.stringify(value))
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
export const sameTaskState = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
export const need = (condition, message) => { if (!condition) throw new Error(message) }
export const rows = (value, label) => {
  need(value === null || Array.isArray(value), `${label} is unavailable; cannot infer an empty collection`)
  return value || []
}
export const exact = (values, predicate, label) => {
  const found = rows(values, label).filter(predicate)
  need(found.length === 1, `Expected one exact ${label}; found ${found.length}. Please select its exact identity.`)
  return cloneTask(found[0])
}
export const matchRef = (values, ref, fields) => {
  const all = Array.isArray(values) ? values : []
  const same = all.filter(v => fields.some(f => v?.[f] === ref))
  if (same.length) return same
  const folded = String(ref).trim().toLowerCase()
  return all.filter(v => fields.some(f => typeof v?.[f] === 'string' && v[f].trim().toLowerCase() === folded))
}
export const matchDevices = (all, ref) => {
  const rows = Array.isArray(all) ? all : []
  const same = rows.filter(d => d.Name === ref || d.WGPubKey === ref || (typeof d.MAC === 'string' && d.MAC.toLowerCase() === ref.toLowerCase()))
  return same.length ? same : matchRef(rows, ref, ['Name'])
}
export const deviceId = d => d.MAC || d.WGPubKey
export const deviceRef = () => string({ minLength: 1, maxLength: 2048, description: 'Exact device name, MAC or public WireGuard identity. Code resolves it.' })
export const deviceRefs = () => array(deviceRef(), { minItems: 1, maxItems: 64, uniqueItems: true })
export const selectDevices = (all, refs) => {
  const selected = refs.map(ref => { const hits = matchDevices(all, ref); return exact(all, d => hits.includes(d), 'device') })
  need(selected.every(d => deviceId(d)), 'A selected device has no usable identity')
  need(new Set(selected.map(d => d.MAC ? d.MAC.toLowerCase() : d.WGPubKey)).size === selected.length, 'The same device was selected twice')
  return selected
}
export const publicDevice = d => Object.fromEntries(['MAC', 'WGPubKey', 'Name', 'RecentIP', 'Policies', 'Groups', 'DeviceTags'].filter(k => d[k] !== undefined).map(k => [k, d[k]]))
export const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
export const windowsSchema = () => array(object({ days: array(enumValue(days), { minItems: 1, maxItems: 7, uniqueItems: true }),
  start: string({ pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' }), end: string({ pattern: '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' }) }, ['days', 'start', 'end']), { maxItems: 32 })
export const compileWindows = windows => windows.map(w => {
  need(w.start !== w.end, 'Equal start and end block no time. Please specify the intended blocked hours.')
  return { Days: days.map(day => w.days.includes(day) ? 1 : 0), Start: w.start, End: w.end }
})

export const executeTaskSteps = async steps => {
  const receipts = []
  for (const step of steps) {
    try {
      const current = await step.read()
      if (sameTaskState(current, step.after)) { receipts.push({ step: step.label, status: 'already_configured' }); continue }
      need(sameTaskState(current, step.before), `${step.label}: settings changed after review`)
      receipts.push({ step: step.label, status: 'sending' })
      await step.write()
      const confirmed = step.verify ? await step.verify() : sameTaskState(await step.read(), step.after)
      receipts[receipts.length - 1].status = confirmed ? 'configuration_verified' : 'unverified'
      if (!confirmed) return { complete: false, steps: receipts, remaining: steps.length - receipts.length }
    } catch (error) {
      const last = receipts[receipts.length - 1]
      if (last?.step === step.label && last.status === 'sending') last.status = 'outcome_unknown'
      else receipts.push({ step: step.label, status: 'not_sent' })
      return { complete: false, steps: receipts, remaining: steps.length - receipts.length }
    }
  }
  return { complete: true, steps: receipts, remaining: 0 }
}

export const taskReceipt = (status, summary, details = {}) => ({
  version: TASK_INTERFACE_VERSION, status, summary, observedAt: new Date().toISOString(), ...details
})
export const receiptForReview = review => taskReceipt(review.noChange ? 'no_change' : 'awaiting_review',
  review.noChange ? review.summary : 'Ready for your review. No changes have been sent.', { operationId: review.operationId, applied: false })
export const receiptForApplied = applied => {
  const partial = applied.result?.complete === false
  const verification = applied.verification
  const status = partial ? 'incomplete' : verification?.verified === true ? 'configured'
    : verification?.verified === false ? 'incomplete' : 'outcome_unknown'
  const steps = applied.result?.steps
  const wasApplied = !steps ? true : steps.some(s => ['outcome_unknown', 'unverified', 'sending'].includes(s.status)) ? null
    : steps.some(s => ['accepted', 'configuration_verified'].includes(s.status))
  return taskReceipt(status, partial ? 'Setup stopped before all steps were confirmed. Review the step results before continuing.'
    : verification?.summary || 'The request returned, but its result has not been verified.', {
      operationId: applied.operationId, applied: wasApplied, verificationScope: 'configuration',
      ...(applied.result?.steps ? { steps: applied.result.steps } : {})
    })
}

const questions = {
  goal: 'What would you like to set up or change: VPN, ad blocking, persona limits, Dynamic DNS, PPPoE, or a wireless uplink?',
  devices: 'Which devices should this apply to? Use their names from Devices; if names repeat, select the MAC address.',
  persona: 'Which child or family persona is this for, and which devices belong to them?',
  schedule: 'How many Internet minutes per day should be allowed, and are there hours when access should be blocked? Times use the router’s local time.',
  vpn_purpose: 'Do you want to connect back to home while away, or send traffic through a VPN provider or another site?',
  interface: 'Which network interface should this use? Keep a separate working connection while changing an uplink.',
  ssid: 'Which WiFi network should be the uplink? Enter its password in the setup form, not chat.',
  hostname: 'Which Dynamic DNS provider, domain, and subdomain should be used? Provider credentials go in the setup form.',
  service: 'What do you want the devices to do together—for example, open a website, print, or access shared files? If you know the app or service, name it.',
  protocol: 'Should this use TCP, UDP, or both? TCP and UDP require separate rules.',
  port_forward: 'Should the forward use TCP or UDP, should the internal port match the external port, and should any Internet source be allowed or only a specific IP/range?',
  time_window: 'What time period should I inspect—for example, the last 15 minutes, hour, or day?',
  plugin: 'Which plugin should I inspect or change? Use its name from System → Plugins.',
  container: 'Which container should I inspect? Use its name from System → Containers.',
  scope: 'Should this apply to every device or only selected devices?',
  protected_devices: 'Devices on the guest network are kept apart from your other devices by default. Which of your devices should I check a guest can reach?',
  confirmation: 'Review the prepared change or complete the setup form to continue. No additional action was sent.'
}
export const explanations = {
  spr: 'SPR is a router with per-device network controls. The UI lets you inspect devices, traffic and configuration, and manage DNS, firewall rules, VPNs and optional plugins. Ask about current state to inspect your router; an explanation alone does not read or change it.',
  dyndns: 'Dynamic DNS updates a DNS record when your public address changes, so you can use a stable hostname. It does not open firewall ports or bypass carrier-grade NAT. Provider credentials belong in the protected setup form. A saved configuration is separate from a published DNS record.',
  pppoe: 'PPPoE is an Internet uplink method used by some ISPs. It needs the ISP’s account details and the correct physical interface. Enter credentials in the protected form, and keep a separate management connection while changing your uplink.',
  wireless_uplink: 'A wireless uplink connects SPR to another WiFi network for upstream connectivity. It is different from the WiFi network SPR provides to your devices. Select a supported uplink interface and network; enter its password in the protected form.',
  wifi: 'SPR’s access-point WiFi connects your devices to the router. Radio settings, bands and channel capabilities depend on the hardware and current configuration. Inspect connected stations and radio status when troubleshooting; a saved SSID is not evidence that a client is connected. Reported WiFi link rates are not measured Internet throughput; local AP station lists do not include every remote mesh AP.',
  dhcp: 'DHCP supplies network settings such as an IP address to a client. An assigned address or old lease is not proof that a device is online. Reservations are stored assignments; leases are time-limited address allocations. DHCP renewal does not change firewall policies. SPR’s device isolation means similar-looking IP addresses do not by themselves grant access between devices.',
  vlan: 'A VLAN separates Ethernet traffic into tagged logical networks. The router, switch and device port configuration must agree. A VLAN number alone does not grant firewall access; inspect interface configuration and device permissions before changing it.',
  routing: 'Routes choose where traffic is sent; firewall rules decide whether traffic is permitted. A VPN route or default gateway can change the path without granting access. 0.0.0.0/0 matches all IPv4 destinations; a route to one subnet is narrower. Inspect the destination and source scope before preparing a routing change.',
  mesh: 'SPR MESH connects supported SPR nodes for a broader network. Enrollment, interface/link state and reachability are separate checks. Enabling a plugin does not prove that another node is enrolled or online.',
  wan: 'The WAN or uplink is SPR’s upstream Internet connection. A device’s wan policy is permission to use it, not proof that the uplink or Internet is working. Inspect uplink health and device restrictions separately.',
  virtual_machine: 'A virtual machine runs a separate guest operating system. A container shares the host kernel. Neither is automatically a physical WiFi client. Available virtualization features and running guests must be checked on the current router.',
  logs: 'Logs record service observations. Timestamps and collection gaps matter, and one error line is not enough to establish a root cause. Use bounded, redacted excerpts; logs can contain credentials or other sensitive information.',
  alerts: 'Alert rules define matching conditions and actions. A configured rule, stored events and notifications in this UI session are different evidence. An empty notification list does not prove that no alert matched.',
  backups: 'SPR configuration backups help restore saved settings. Do not assume they include the entire disk or every container’s data. A filename or successful download alone does not prove a backup can be restored.',
  authentication: 'OTP, passkeys and API tokens serve different authentication needs. The assistant can inspect status or metadata; codes, seeds, private keys and tokens belong in the protected setup controls, not chat.',
  feature_flags: 'Feature flags enable optional application paths. Enabling a flag does not install a plugin, start a container or prove that a feature is healthy. Inspect the relevant configuration and runtime status separately.',
  container: 'A container runs an application and its dependencies as an isolated process on the router. SPR uses containers for services and plugins. A container is not a physical device or a full virtual machine. An image is the packaged template; a container is an instance of it. Stopping a container stops that service, not the host, but stopping a critical service can interrupt networking. Running does not necessarily mean healthy; inspect its status and logs before restarting it.',
  plugins: 'Plugins add features to SPR. Installed, enabled, running and healthy are different states: configuration shows what is enabled; container status and logs show runtime evidence. Plugins may share containers or use a different runtime, so names alone do not establish health.',
  policies: 'Policies are named permissions on a device. wan grants Internet access, dns grants resolver access, and lan grants broad directional LAN access. These are configured permissions; additional firewall rules, schedules and connectivity can still restrict traffic.',
  groups: 'An enabled shared Group can grant communication between its members. Groups are different from Policies and DeviceTags. Groups are access permissions, not Ethernet VLAN tags. To explain a particular device’s access, read its memberships, the group configuration and applicable firewall rules.',
  tags: 'DeviceTags label devices and can select DNS or firewall rules. Sharing a tag does not itself grant connectivity. Inspect the rules using that tag before changing it.',
  port_forward: 'A port forward sends incoming traffic on an external port to an internal IP and port. TCP and UDP are distinct. Source restrictions control who can connect. Review the destination, protocol and source scope before applying it; saving a rule does not prove external reachability.',
  traffic: 'Traffic views report observed bytes and destinations over a time window. They are not full browsing histories: HTTPS page contents and full URLs are not available from destination counters. Bytes measure volume, bandwidth is volume per unit time, and connection count measures flows rather than bytes. An ASN identifies a network operator, not a specific website. Insights may aggregate hourly buckets, so a requested short window can include earlier traffic in the same hour. Collection gaps, retention and IP reuse can limit attribution.',
  guest_isolation: 'Devices on the guest network are kept apart from your other devices by default: they have no lan policy and no groups. A guest device can only reach another device if it has been given the lan policy, a shared group or a tag that a firewall endpoint allows. There is no separate isolation setting to turn on.',
  internet_dns: 'Internet and DNS access are separate permissions. Blocking Internet does not require removing DNS. DNS-only access must be requested explicitly.',
  family_time: 'Family limits count active Internet minutes across the persona’s devices, not screen time. Usage resets at 06:00 router time; temporary grants can override blocking.',
  ad_blocking: 'SPR can block ad domains through DNS filtering. It cannot remove every ad, and clients bypassing SPR DNS may bypass that filtering.',
  vpn: 'Remote-access VPN connects you back to home. A provider or site VPN sends selected traffic through another endpoint. The setup form keeps private keys outside chat.',
  status: 'Task status comes from SPR API results and readback. A prepared change or an open setup form does not mean it has been applied.'
}
export const taskConversationOperations = [
  { id: 'tasks.clarify', label: 'Ask for a missing task choice', schema: object({ field: enumValue(Object.keys(questions)) }, ['field']),
    description: 'Ask a concise code-authored question for a genuinely missing choice. Do not ask for credentials. Use this instead of free-form text in task mode.',
    run: async ({ field }) => ({ message: questions[field], receipt: taskReceipt('needs_input', questions[field], { applied: false }) }) },
  { id: 'tasks.explain', label: 'Explain SPR behavior', schema: object({ topic: enumValue(Object.keys(explanations)) }, ['topic']),
    description: 'Explain known SPR behavior without claiming anything was inspected, changed or completed.',
    run: async ({ topic }) => ({ message: explanations[topic], receipt: taskReceipt('information', 'General SPR behavior; current configuration has not been checked.', { applied: false }) }) }
].map(spec => ({ ...spec, domain: 'tasks', kind: 'read', task: true, terminalResponse: true,
  menus: ['AI Assistant'], sources: ['frontend/src/components/Assistant/taskRuntime.js'] }))

export const knowledgeOperations = [{
  id: 'knowledge.read', domain: 'assistant', kind: 'read', label: 'Read SPR reference information',
  description: 'Read reference facts to answer a conceptual or how-to question in your own words. This does not inspect current settings or prove a change was applied. Use live read tools for current-router questions.',
  schema: object({ topics: array(enumValue(Object.keys(explanations)), { minItems: 1, maxItems: 6, uniqueItems: true }) }, ['topics']),
  menus: ['AI Assistant'], sources: ['frontend/src/components/Assistant/taskRuntime.js'],
  run: async ({ topics }) => ({ evidenceType: 'reference', currentConfigurationChecked: false,
    facts: topics.map(topic => ({ topic, text: explanations[topic] })), applied: false })
}]
