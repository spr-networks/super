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

  addOutputBLock(data) {
    return this.put('block_output', data)
  }

  deleteOutputBlock(data) {
    return this.delete('block_output', data)
  }

  addServicePort(data) {
    return this.put('service_port', data)
  }
  deleteServicePort(data) {
    return this.delete('service_port', data)
  }

  addMulticastPort(data) {
    return this.put('multicast', data)
  }

  deleteMulticastPort(data) {
    return this.delete('multicast', data)
  }

  setICMP(data) {
    return this.put('icmp', data)
  }

  setMulticast(data) {
    return this.put('multicast', data)
  }

  addCustomInterfaceRule(data) {
    return this.put('custom_interface', data)
  }

  deleteCustomInterfaceRule(data) {
    return this.delete('custom_interface', data)
  }

  getTLS() {
    return this.get('enableTLS')
  }

  setTLS() {
    return this.put('enableTLS')
  }

}

export const firewallAPI = new APIFirewall()
