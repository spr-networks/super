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
  hostnames() {
    return this.get('dnsHostnames')
  }
  putHostname(hostname, data) {
    return this.put(`dns/hostnames/${encodeURIComponent(hostname)}`, data)
  }
  deleteHostname(hostname, data) {
    return this.delete(`dns/hostnames/${encodeURIComponent(hostname)}`, data)
  }
}

export const CoreDNS = new APICoreDNS()
