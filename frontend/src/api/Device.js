import API from './API'

export class APIDevice extends API {
  constructor() {
    super('/')
  }

  list = () => this.get('/devices')
  update = (data) => {
    if (!data || !data.MAC) {
      throw new Error('No MAC key specified')
    }
    return this.put(`/device/${data.MAC}`, data)
  }

  updateName = (MAC, Name) => this.update({ MAC, Name })
  updateZones = (MAC, Zones) => this.update({ MAC, Zones })
  updateTags = (MAC, DeviceTags) => this.update({ MAC, DeviceTags })
  deleteDevice = (MAC) => this.delete(`/device/${MAC}`, { MAC })
  setPSK = (MAC, Psk, Type, Name) =>
    this.update({ MAC, Name, PSKEntry: { Psk, Type } })
  pendingPSK = () => this.get('/pendingPSK')
}

export const deviceAPI = new APIDevice()
