import API from './API'

export class APITraffic extends API {
  constructor() {
    super('')
  }

  traffic(name = null) {
    if (name) {
      return this.map(name)
    }

    return this.get('/iptraffic')
  }

  map(name){ return this.get(`/traffic/${name}`)}
  history(minutes){
    let qs = minutes ? `?minutes=${minutes}` : ''
    return this.get(`/traffic_history${qs}`)
  }
}

export const trafficAPI = new APITraffic()
