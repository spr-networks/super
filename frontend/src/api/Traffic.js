import API from './API'

export class APITraffic extends API {
  constructor() {
    super('')
  }

  traffic = () => this.get('/iptraffic')
  history = () => this.get('/traffic_history')
  map = (name) => this.get(`/traffic/${name}`)
}

export const trafficAPI = new APITraffic()
