import API from './API'

export class APITopology extends API {
  constructor() {
    super('/')
  }

  getTopology() {
    return this.get('topology')
  }
}

export const topologyAPI = new APITopology()
