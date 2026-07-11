const normalizeMAC = (value) => String(value || '').trim().toLowerCase()

const normalizeIP = (value) =>
  String(value || '')
    .trim()
    .replace(/^\[|\]$/g, '')
    .split('/')[0]

const deviceIdentity = (device) => device?.MAC || device?.WGPubKey || ''

const findSourceDevice = (item, devices = []) => {
  const event = item?.Event || {}
  const mac = normalizeMAC(
    event.MAC || event.SrcMAC || event.Ethernet?.SrcMAC
  )
  const ip = normalizeIP(event.SrcIP || event.IP?.SrcIP)

  return (
    devices.find((device) => mac && normalizeMAC(device.MAC) === mac) ||
    devices.find(
      (device) => ip && normalizeIP(device.RecentIP) === ip
    ) ||
    null
  )
}

const vlanFromInterface = (iface) => {
  const match = String(iface || '').match(/\.(\d{1,4})$/)
  if (!match) return null
  const vlan = Number(match[1])
  return vlan >= 1 && vlan <= 4094 ? String(vlan) : null
}

const protocolAndPort = (event = {}) => {
  if (event.TCP) {
    return { protocol: 'tcp', port: String(event.TCP.DstPort || 'any') }
  }
  if (event.UDP) {
    return { protocol: 'udp', port: String(event.UDP.DstPort || 'any') }
  }
  return { protocol: 'tcp', port: 'any' }
}

const slug = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const firewallDraft = (item, device) => {
  const event = item?.Event || {}
  const destination = normalizeIP(event.DstIP || event.IP?.DstIP)
  if (!destination || ['0.0.0.0', '255.255.255.255'].includes(destination)) {
    return null
  }

  const { protocol, port } = protocolAndPort(event)
  const deviceName = device.Name || device.MAC || device.RecentIP
  const tag = `alert-${slug(deviceName).slice(0, 24)}`
  const ruleName = `allow-${slug(destination)}-${port}`.slice(0, 48)

  return {
    RuleName: ruleName,
    Description: `Allow ${deviceName} after ${item.Title || item.Topic} alert`,
    IP: destination,
    Port: port,
    Protocol: protocol,
    Tag: tag,
    initialDeviceIds: [deviceIdentity(device)].filter(Boolean)
  }
}

export const getAlertResolution = (item, devices = []) => {
  const topic = String(item?.Topic || '').replace(/:+$/, '')
  const event = item?.Event || {}
  const device = findSourceDevice(item, devices)

  if (topic.startsWith('nft:drop:mac')) {
    const vlan = vlanFromInterface(event.InDev)
    const currentVlan = String(device?.VLANTag || '').trim()
    if (device && vlan && (!currentVlan || currentVlan === '0')) {
      return {
        kind: 'assign-vlan',
        device,
        vlan,
        title: `Assign VLAN ${vlan}`,
        description: `${device.Name || device.MAC} arrived on ${event.InDev}, but the device has no VLAN tag assigned.`,
        actionLabel: `Assign VLAN ${vlan}`
      }
    }
    return null
  }

  if (topic.startsWith('nft:drop:private')) {
    const policies = device?.Policies || []
    if (device && !policies.includes('lan_upstream')) {
      return {
        kind: 'apply-upstream-policy',
        device,
        title: 'Allow upstream private networks',
        description: `${device.Name || device.MAC} does not have the Upstream Private Networks policy. Apply it broadly, or create a narrower destination rule.`,
        actionLabel: 'Apply upstream policy',
        firewallDraft: firewallDraft(item, device)
      }
    }
    return null
  }

  if (topic.startsWith('wifi:auth:fail')) {
    const pskType = device?.PSKEntry?.Type
    if (device && ['sae', 'wpa2'].includes(pskType)) {
      return {
        kind: 'update-wifi-password',
        device,
        title: 'Update device Wi-Fi password',
        description: `${device.Name || device.MAC} is known, so its per-device Wi-Fi password can be replaced safely.`,
        actionLabel: 'Update password'
      }
    }
  }

  return null
}

export { findSourceDevice, firewallDraft, vlanFromInterface }
