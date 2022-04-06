import API from './API'

export class APITraffic extends API {
  constructor() {
    super('')
  }

  traffic = (name = null) => {
    if (name) {
      return this.map(name)
    }

    return this.get('/iptraffic')
  }

  map = (name) => this.get(`/traffic/${name}`)
  history = () => this.get('/traffic_history')
}

export const trafficAPI = new APITraffic()
