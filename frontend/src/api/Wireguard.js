import API from './API'

export class APIWireguard extends API {
  constructor() {
    super('/plugins/wireguard/')
  }

  //config = () => this.get('/config')
  peers = () => this.get('peers')
  status = () => this.get('status')
  putPeer = (data) => this.put('peer', data)
  deletePeer = (data) => this.delete('peer', data)
}

export const wireguardAPI = new APIWireguard()
