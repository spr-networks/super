import API from './API'

export class APIWifi extends API {
  constructor() {
    super('/hostapd')
  }

  config = () => this.get('/config')
  allStations = () => this.get('/all_stations')
  status = () => this.get('/status')
}

export const wifiAPI = new APIWifi()
