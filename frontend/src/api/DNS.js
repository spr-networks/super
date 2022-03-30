import API from './index'

export class APIDNSBlock extends API {
  constructor() {
    super('/plugins/dns/block')
  }

  config = () => this.get('/config')
  blocklists = () => this.get('/blocklists')
  putBlocklist = data => this.put('/blocklists', data)
  deleteBlocklist = (data) => this.delete('/blocklists', data)
  putOverride = (data) => this.put('/override', data)
  deleteOverride = (data) => this.delete('/override', data)
}

export class APIDNSLog extends API {
  constructor() {
    super('/plugins/dns/log')
  }

  config = () => this.get('/config')
}

export const blockAPI = new APIDNSBlock()
export const logAPI = new APIDNSLog()
