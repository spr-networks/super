import { prettyToJSONPath } from 'components/Logs/FilterSelect'

const structuredOperator = /(==|!=|=~|>=|<=|>|<)/

export const isStructuredAlertSearch = (query) =>
  String(query || '').trim().startsWith('$[?(') ||
  structuredOperator.test(String(query || ''))

export const getAlertServerFilter = (query) => {
  const value = String(query || '').trim()
  return value && isStructuredAlertSearch(value)
    ? prettyToJSONPath(value)
    : ''
}

const collectSearchText = (value, output) => {
  if (value === null || value === undefined) return
  if (Array.isArray(value)) {
    value.forEach((entry) => collectSearchText(entry, output))
    return
  }
  if (typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => {
      output.push(key)
      collectSearchText(entry, output)
    })
    return
  }
  output.push(String(value))
}

export const alertSearchText = (item, devices = [], contextValues = []) => {
  const parts = []
  collectSearchText(item, parts)
  collectSearchText(contextValues, parts)
  const baseText = parts.join(' ').toLowerCase()

  for (const device of devices || []) {
    const identities = [device.MAC, device.RecentIP, device.WGPubKey]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
    if (identities.some((identity) => baseText.includes(identity))) {
      collectSearchText(
        [device.Name, device.Hostname, device.Groups, device.Tags],
        parts
      )
    }
  }

  return parts.join(' ').toLowerCase()
}

export const filterAlertsBySearch = (
  items,
  query,
  devices = [],
  contextValues = []
) => {
  const value = String(query || '').trim().toLowerCase()
  if (!value || isStructuredAlertSearch(value)) return items

  const terms = value.split(/\s+/).filter(Boolean)
  return items.filter((item) => {
    const haystack = alertSearchText(item, devices, contextValues)
    return terms.every((term) => haystack.includes(term))
  })
}
