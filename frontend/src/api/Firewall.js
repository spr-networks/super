import API from './API'

export class APIFirewall extends API {
  constructor() {
    super('/firewall/')
  }

  config() {
    return this.get('config')
  }

  addEndpoint(data) {
    return this.put('endpoint', data)
  }

  deleteEndpoint(data) {
    return this.delete('endpoint', data)
  }

  addForward(data) {
    return this.put('forward', data)
  }
  deleteForward(data) {
    return this.delete('forward', data)
  }

  addBlock(data) {
    return this.put('block', data)
  }
  deleteBlock(data) {
    return this.delete('block', data)
  }

  addForwardBlock(data) {
    return this.put('block_forward', data)
  }
  deleteForwardBlock(data) {
    return this.delete('block_forward', data)
  }

  addServicePort(data) {
    return this.put('service_port', data)
  }
  deleteServicePort(data) {
    return this.delete('service_port', data)
  }

  setICMP(data) {
    return this.put('icmp', data)
  }

  setMulticast(data) {
    return this.put('multicast', data)
  }
}

export const firewallAPI = new APIFirewall()
