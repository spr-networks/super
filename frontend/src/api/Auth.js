import API from './API'

export class APIAuth extends API {
  constructor() {
    super('/')
  }

  tokens = () => this.get('tokens')
  putToken = (Name, Expire, ScopedPaths) => this.put('tokens', { Expire, Name, ScopedPaths })
  deleteToken = (Token) => this.delete('tokens', { Token })
}

export const authAPI = new APIAuth()
