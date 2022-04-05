import API from './index'

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
}

export const deviceAPI = new APIDevice()
