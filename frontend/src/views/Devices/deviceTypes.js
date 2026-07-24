export const CONTAINER_DEVICE_TYPE = 'Container'

export const isContainerDevice = (device) =>
  device?.Type?.toLowerCase() === CONTAINER_DEVICE_TYPE.toLowerCase()

export const filterDevicesForPane = (devices, showContainers) =>
  devices.filter((device) =>
    showContainers ? isContainerDevice(device) : !isContainerDevice(device)
  )

const identitiesMatch = (left, right) => {
  if (!left || !right) {
    return false
  }

  if (left.includes(':') && right.includes(':')) {
    return left.toLowerCase() === right.toLowerCase()
  }

  return left === right
}

export const deviceValues = (devices) =>
  Array.isArray(devices) ? devices : Object.values(devices || {})

export const findDeviceByIdentity = (devices, identity) => {
  if (!identity) {
    return null
  }

  if (!Array.isArray(devices)) {
    const entry = Object.entries(devices || {}).find(([key]) =>
      identitiesMatch(key, identity)
    )
    if (entry) {
      return entry[1]
    }
  }

  return (
    deviceValues(devices).find(
      (device) =>
        identitiesMatch(device.MAC, identity) ||
        identitiesMatch(device.WGPubKey, identity)
    ) || null
  )
}

export const normalizeDeviceForUI = (device) => ({
  ...device,
  PSKEntry: device?.PSKEntry || { Psk: '', Type: '' },
  Policies: device?.Policies || [],
  Groups: device?.Groups || [],
  DeviceTags: device?.DeviceTags || [],
  Style: device?.Style || {}
})

const stripHostPrefix = (value) => value?.replace(/\/32$/, '') || ''

export const findContainerAccessRule = (rules, device) => {
  if (!isContainerDevice(device)) {
    return null
  }

  const entries = rules || []
  const namedRule = entries.find(
    (rule) => rule.RuleName === `Plugin-${device.Name}`
  )
  if (namedRule) {
    return namedRule
  }

  const deviceInterface = device.DHCPLastInterface || device.LastIface
  const deviceIP = stripHostPrefix(device.RecentIP)

  return (
    entries.find(
      (rule) =>
        deviceInterface &&
        rule.Interface === deviceInterface &&
        stripHostPrefix(rule.SrcIP) === deviceIP
    ) ||
    entries.find(
      (rule) => deviceIP && stripHostPrefix(rule.SrcIP) === deviceIP
    ) ||
    null
  )
}
