import API from './API'

export class APIWireguard extends API {
  constructor() {
    super('/plugins/wireguard/')
  }

  //config = () => this.get('/config')
  peers() {
    return this.get('peers')
  }
  status() {
    return this.get('status')
  }
  genKey() {
    return this.get('genkey')
  }
  putPeer(data) {
    return this.put('peer', data)
  }
  deletePeer(data) {
    return this.delete('peer', data)
  }
  up() {
    return this.put('up')
  }
  down() {
    return this.put('down')
  }

  getEndpoints() {
    return this.get('endpoints')
  }

  setEndpoints(endpoints) {
    return this.put('endpoints', endpoints)
  }
}

export const wireguardAPI = new APIWireguard()
