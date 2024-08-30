import API from './API'

export class APIDynDns extends API {
  constructor() {
    super('/plugins/dyndns/')
  }

  config(){ return this.get('config') }
  setConfig(data){ return this.put('config', data) }
  refresh(){ return this.get('refresh') }
}

export const dyndnsAPI = new APIDynDns()
