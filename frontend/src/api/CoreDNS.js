import API from './API'

export class APICoreDNS extends API {
  constructor() {
    super('/')
  }

  config() {
    return this.get('dnsSettings')
  }
  setConfig(data) {
    return this.put('dnsSettings', data)
  }
}

export const CoreDNS = new APICoreDNS()
