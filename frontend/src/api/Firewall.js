import API from './API'

export class APIFirewall extends API {
  constructor() {
    super('/firewall/')
  }

  config = () => this.get('config')

  addForward = (data) => this.put('forward', data)
  deleteForward = (data) => this.delete('forward', data)

  addBlockSrc = (data) => this.put('blocksrc', data)
  deleteBlockSrc = (data) => this.delete('blocksrc', data)

  addBlockDst = (data) => this.put('blockdst', data)
  deleteBlockDst = (data) => this.delete('blockdst', data)
}

export const firewallAPI = new APIFirewall()
