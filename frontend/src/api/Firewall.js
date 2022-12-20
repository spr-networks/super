import API from './API'

export class APIFirewall extends API {
  constructor() {
    super('/firewall/')
  }

  config() {
    return this.get('config');
  }

  addForward(data) {
    return this.put('forward', data);
  }
  deleteForward(data) {
    return this.delete('forward', data);
  }

  addBlock(data) {
    return this.put('block', data);
  }
  deleteBlock(data) {
    return this.delete('block', data);
  }

  addForwardBlock(data) {
    return this.put('block_forward', data);
  }
  deleteForwardBlock(data) {
    return this.delete('block_forward', data);
  }

  addServicePort(data) {
    return this.put('service_port', data);
  }
  deleteServicePort(data) {
    return this.delete('service_port', data);
  }
}

export const firewallAPI = new APIFirewall()
