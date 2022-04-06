import API from './API'

export class APIZone extends API {
  constructor() {
    super('')
  }

  list = () => this.get('/zones')
}

export const zoneDescriptions = {
  "dns" : "Outbound DNS Access",
  "wan": "Outbound Internet Access",
  "lan": "LAN access",
  "isolated" : "No access. By default devices without a group are treated as isolated"
}

export const zoneAPI = new APIZone()
