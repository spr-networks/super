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

  // TODO add this functionality to base api
  _macPrefix = (mac) => mac.replace(/:/g, '').toUpperCase().substring(0, 6)
  oui = (mac) => this.get(`/plugins/oui/${this._macPrefix(mac)}`)
  ouis = (macs) => {
    let prefixs = macs.map(this._macPrefix).join(',')

    return this.get(`/plugins/oui/${prefixs}`)
  }
}

export const deviceAPI = new APIDevice()
