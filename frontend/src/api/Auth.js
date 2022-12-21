import API from './API'

export class APIAuth extends API {
  constructor() {
    super('/')
  }

  tokens() {
    return this.get('tokens');
  }

  putToken(Name, Expire, ScopedPaths) {
    return this.put('tokens', { Expire, Name, ScopedPaths });
  }

  deleteToken(Token) {
    return this.delete('tokens', { Token });
  }
}

export const authAPI = new APIAuth()
