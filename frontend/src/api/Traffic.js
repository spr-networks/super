import API from './index'

export class APITraffic extends API {
  constructor() {
    super('')
  }

  history = () => this.get('/traffic_history')
  map = (name) => this.get(`/traffic/${name}`)
}

export const trafficAPI = new APITraffic()
