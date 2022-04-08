import API from './API'

export class APIWifi extends API {
  constructor() {
    super('/')
  }

  config = () => this.get('hostapd/config')
  allStations = () => this.get('hostapd/all_stations')
  status = () => this.get('hostapd/status')
  arp = () => this.get('arp')
  ipAddr = () => this.get('ip/addr')
}

export const wifiAPI = new APIWifi()
