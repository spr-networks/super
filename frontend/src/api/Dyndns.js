import API from './API'

export class APIDynDns extends API {
  constructor() {
    super('/plugins/dyndns/')
  }

  config = () => this.get('config')
  setConfig = (data) => this.put('config', data)
  refresh = () => this.get('refresh')
}

export const dyndnsAPI = new APIDynDns()
