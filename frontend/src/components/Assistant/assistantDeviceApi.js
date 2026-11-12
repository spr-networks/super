import { deviceAPI as productDeviceAPI } from 'api'

const sameId = (device, id) => device && (device.WGPubKey === id || (typeof device.MAC === 'string' && typeof id === 'string' && device.MAC.toLowerCase() === id.toLowerCase()))

const preserved = async (id) => {
  const listed = await productDeviceAPI.list()
  const current = Object.values(listed || {}).find(device => sameId(device, id))
  if (!current) return {}
  const disabled = current.DeviceDisabled === true || (Array.isArray(current.Policies) && current.Policies.includes('disabled'))
  return { ...(disabled ? { DeviceDisabled: true } : {}), ...(current.DeleteExpiration === true ? { DeleteExpiration: true } : {}) }
}

const update = async (id, data) => productDeviceAPI.update(id, { ...data, ...(await preserved(id)) })

export const deviceAPI = new Proxy(productDeviceAPI, {
  get: (target, key) => {
    if (key === 'update') return update
    if (key === 'updateGroups') return (id, Groups) => update(id, { Groups })
    if (key === 'updateTags') return (id, DeviceTags) => update(id, { DeviceTags })
    if (key === 'updatePolicies') return (id, Policies) => update(id, { Policies })
    if (key === 'updateName') return (id, Name) => update(id, { Name })
    const value = target[key]
    return typeof value === 'function' ? value.bind(target) : value
  }
})
