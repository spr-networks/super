import API from './API'

export class APIFirewall extends API {
  constructor() {
    super('/firewall/')
  }

  config = () => {return this.get('config')}

  addForward = (data) => this.put('forward', data)
  deleteForward = (data) => this.delete('forward', data)

  addBlock = (data) => this.put('block', data)
  deleteBlock = (data) => this.delete('block', data)

}

export const firewallAPI = new APIFirewall()
