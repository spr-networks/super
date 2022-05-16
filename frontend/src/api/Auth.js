import API from './API'

export class APIAuth extends API {
  constructor() {
    super('/')
  }

  tokens = () => this.get('tokens')
  putToken = (Expire) => this.put('tokens', { Expire })
  deleteToken = (Token) => this.delete('tokens', { Token })
}

export const authAPI = new APIAuth()
