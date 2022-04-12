import API from './API'

export class APIDNSBlock extends API {
  constructor() {
    super('/plugins/dns/block')
  }

  config = () => this.get('/config')
  blocklists = () => this.get('/blocklists')
  putBlocklist = (data) => this.put('/blocklists', data)
  deleteBlocklist = (data) => this.delete('/blocklists', data)
  putOverride = (data) => this.put('/override', data)
  deleteOverride = (data) => this.delete('/override', data)
  metrics = () => this.get('/metrics')
}

export class APIDNSLog extends API {
  constructor() {
    super('/plugins/dns/log')
  }

  config = () => this.get('/config')
  hostPrivacyList = () => this.get('/host_privacy_list')
  putHostPrivacyList = (data) => this.put('/host_privacy_list', data)
  domainIgnores = () => this.get('/domain_ignores')
  //putDomainIgnores = (data) => this.put(`/domain_ignores`, data)
  addDomainIgnores = (item) => this.put(`/domain_ignore/${item}`, {})
  history = (ip) => this.get(`/history/${ip}`, {})
  deleteHistory = (ip) => this.delete(`/history/${ip}`)
}

export const blockAPI = new APIDNSBlock()
export const logAPI = new APIDNSLog()
