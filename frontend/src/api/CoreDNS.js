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
    return this.put(`dnsHostnames/${encodeURIComponent(hostname)}`, data)
  }
  deleteHostname(hostname, data) {
    return this.delete(`dnsHostnames/${encodeURIComponent(hostname)}`, data)
  }
  resetHostname(hostname) {
    return this.put(`dnsHostnames/${encodeURIComponent(hostname)}/reset`)
  }
}

export const CoreDNS = new APICoreDNS()
