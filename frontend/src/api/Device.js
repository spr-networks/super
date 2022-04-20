import API from './API'

export class APIDevice extends API {
  constructor() {
    super('/')
  }

  list = () => this.get('/devices')
  update = (id, data) => {
    if (data === undefined) {
      data = id
      id = data.MAC
    }

    if (!data || !id) {
      throw new Error('No key specified')
    }

    // check if the device id is MAC or wg base64
    if (id.includes(':')) {
      data.MAC = id
    } else {
      data.WGPubKey = id
    }

    return this.put(`/device/${encodeURIComponent(id)}`, data)
  }

  updateName = (id, Name) => this.update(id, { Name })
  updateZones = (id, Zones) => this.update(id, { Zones })
  updateTags = (id, DeviceTags) => this.update(id, { DeviceTags })
  deleteDevice = (id) => {
    if (id.includes(':')) {
      this.delete(`/device/${id}`, { MAC: id })
    } else {
      this.delete(`/device/${encodeURIComponent(id)}`, { WGPubKey: id })
    }
  }
  setPSK = (MAC, Psk, Type, Name) =>
    this.update({ MAC, Name, PSKEntry: { Psk, Type } })
  pendingPSK = () => this.get('/pendingPSK')

  // TODO add this functionality to base api
  oui = (mac) => this.get(`/plugins/lookup/oui/${mac}`)
  ouis = (macs) => {
    return this.get(`/plugins/lookup/oui/${macs.join(',')}`)
  }
}

export const deviceAPI = new APIDevice()
