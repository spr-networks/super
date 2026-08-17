import API from './API'

export class APIAllowlist extends API {
  constructor() {
    super('')
  }

  config() {
    return this.get('/firewall/allowlist/config')
  }

  setConfig(config) {
    return this.put('/firewall/allowlist/config', config)
  }

  status() {
    return this.get('/firewall/allowlist/status')
  }

  refresh() {
    return this.put('/firewall/allowlist/refresh')
  }

  asnSearch(query) {
    return this.get(`/plugins/lookup/asn_search/${query}`)
  }
}

export const allowlistAPI = new APIAllowlist()
