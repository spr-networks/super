import API from './index'

export class APIDevice extends API {
  constructor() {
    super('')
  }

  list = () => this.get('/devices')
  update = (data) => {
    if (!data || !data.Mac) {
      throw new Error('No Mac key specified')
    }
    return this.put(`/device/${data.Mac}`, data)
  }

  updateName = (Mac, Name) => this.update({Mac, Name})
  updateZones = (Mac, Zones) => this.update({Mac, Zones})
  updateTags = (Mac, DeviceTags) => this.update({Mac, DeviceTags})
  delete = (Mac) => this.delete(`/device/${Mac}`, {Mac})
}

export const deviceAPI = new APIDevice()