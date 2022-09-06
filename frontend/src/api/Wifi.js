import API from './API'

export class APIWifi extends API {
  constructor() {
    super('/')
  }

  config = (iface) => this.get(`hostapd/${iface}/config`)
  updateConfig = (iface, config) => this.put(`hostapd/${iface}/config`, config)
  setChannel = (iface, params) =>
    this.put(`hostapd/${iface}/setChannel`, params)
  allStations = (iface) => this.get(`hostapd/${iface}/all_stations`)
  status = (iface) => this.get(`hostapd/${iface}/status`)
  arp = () => this.get('arp')
  ipAddr = () => this.get('ip/addr')
  ipLinkState = (iface, state) => this.put(`ip/link/${iface}/${state}`)
  iwDev = () => this.get('iw/dev')
  iwList = () => this.get('iw/list')
  iwScan = (iface) => this.get(`iw/dev/${iface}/scan`)
  enableInterface = (iface) => this.put(`hostapd/${iface}/enable`)
  disableInterface = (iface) => this.put(`hostapd/${iface}/disable`)
  resetInterfaceConfig = (iface) =>
    this.put(`hostapd/${iface}/resetConfiguration`)
  restartWifi = () => this.put(`hostapd/restart`)
  interfacesConfiguration = () => this.get(`interfacesConfiguration`)
  interfaces = (typeFilter) => {
    //look up the interfaces from iw/dev
    return wifiAPI.iwDev().then((devs) => {
      let ifaces = []
      for (let dev of Object.keys(devs)) {
        let wifis = Object.keys(devs[dev])
        for (let wifi of wifis) {
          //only grab devices in AP mode
          if (typeFilter) {
            if (!devs[dev][wifi].type.includes(typeFilter)) continue
          }
          //ignore vlans
          if (wifi.includes('.')) continue
          ifaces = ifaces.concat(wifi)
        }
      }

      ifaces = ifaces.sort()
      return ifaces
    })
  }

  defaultInterface = () => {
    return new Promise((resolve, reject) => {
      this.interfaces('AP')
        .then((ifaces) => {
          if (!ifaces.length) {
            reject('missing AP interface')
          }

          resolve(ifaces[0])
        })
        .catch(reject)
    })
  }

  //TBD this is in the wrong spot. Needs its own plugin.
  asn = (ip) => {
    return this.get(`/plugins/lookup/asn/${ip}`)
  }
  asns = (ips) => {
    if (typeof ips === 'string') {
      ips = ips.split(',')
    }

    return this.get(`/plugins/lookup/asns/${ips.join(',')}`)
  }
}

export const wifiAPI = new APIWifi()
