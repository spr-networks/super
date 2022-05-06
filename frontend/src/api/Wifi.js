import { TimeScale } from 'chart.js'
import API from './API'

export class APIWifi extends API {
  constructor() {
    super('/')
  }

  config = () => this.get('hostapd/config')
  updateConfig = (config) => this.put('hostapd/config', config)
  setChannel = (params) => this.put('hostapd/setChannel', params)
  allStations = () => this.get('hostapd/all_stations')
  status = () => this.get('hostapd/status')
  arp = () => this.get('arp')
  ipAddr = () => this.get('ip/addr')
  ipLinkState = (iface, state) => this.put(`ip/link/${iface}/${state}`)
  iwDev = () => this.get('iw/dev')
  iwList = () => this.get('iw/list')
  iwScan = (iface) => this.get(`iw/dev/${iface}/scan`)
  asn = (ips) => {
    if (typeof ips === 'string') {
      ips = [ips]
    }

    return this.get(`/plugins/lookup/asn/${ips.join(',')}`)
  }
}

export const wifiAPI = new APIWifi()
