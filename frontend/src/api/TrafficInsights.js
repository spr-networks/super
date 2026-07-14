import API from './API'

export class APITrafficInsights extends API {
  constructor() {
    super('/traffic_insights/')
  }

  config() {
    return this.get('config')
  }

  setConfig(cfg) {
    return this.put('config', cfg)
  }

  overview(minutes) {
    let qs = minutes ? `?minutes=${minutes}` : ''
    return this.get(`overview${qs}`)
  }

  device(ip, minutes) {
    let qs = minutes ? `?minutes=${minutes}` : ''
    return this.get(`device/${ip}${qs}`)
  }
}

export const trafficInsightsAPI = new APITrafficInsights()
