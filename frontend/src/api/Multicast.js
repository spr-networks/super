import API from './API'

export class APIMulticast extends API {
  constructor() {
    super('/')
  }

  config(){ return this.get('multicastSettings') }
  setConfig(data){ return this.put('multicastSettings', data) }
}

export const Multicast = new APIMulticast()
