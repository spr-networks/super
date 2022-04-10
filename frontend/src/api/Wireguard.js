import API from './API'

export class APIWireguard extends API {
  constructor() {
    super('/plugins/wireguard')
  }

  config = () => this.get('config')
}

export const wireguardAPI = new APIWireguard()
