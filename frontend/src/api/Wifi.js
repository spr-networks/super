import API from './API'

export default class APIWifi extends API {
  constructor() {
    super('/')
  }

  config(iface) {
    return this.get(`hostapd/${iface}/config`);
  }

  updateConfig(iface, config) {
    return this.put(`hostapd/${iface}/config`, config);
  }

  setChannel(iface, params) {
    return this.put(`hostapd/${iface}/setChannel`, params);
  }

  calcChannel(params) {
    return this.put(`hostapd/calcChannel`, params);
  }

  allStations(iface) {
    return this.get(`hostapd/${iface}/all_stations`);
  }

  status(iface) {
    return this.get(`hostapd/${iface}/status`);
  }

  arp() {
    return this.get('arp');
  }

  ipAddr() {
    return this.get('ip/addr');
  }

  ipLinkState(iface, state) {
    return this.put(`ip/link/${iface}/${state}`);
  }

  iwDev() {
    return this.get('iw/dev');
  }

  iwList() {
    return this.get('iw/list');
  }

  iwReg() {
    return this.get('iw/reg');
  }


  iwScan(iface) {
    return this.get(`iw/dev/${iface}/scan`);
  }

  enableInterface(iface) {
    return this.put(`hostapd/${iface}/enable`);
  }

  disableInterface(iface) {
    return this.put(`hostapd/${iface}/disable`);
  }

  resetInterfaceConfig(iface) {
    return this.put(`hostapd/${iface}/resetConfiguration`);
  }


  enableExtraBSS(iface, params) {
    return this.put(`hostapd/${iface}/enableExtraBSS`, params);
  }

  disableExtraBSS(iface) {
    return this.delete(`hostapd/${iface}/enableExtraBSS`);
  }

  restartWifi() {
    return this.put(`hostapd/restart`);
  }

  syncMesh() {
    return this.put(`hostapd/syncMesh`);
  }

  interfacesConfiguration() {
    return this.get(`interfacesConfiguration`)
  }

  interfaces(typeFilter) {
    //look up the interfaces from iw/dev
    return wifiAPI.iwDev().then((devs) => {
      let ifaces = [];
      for (let dev of Object.keys(devs)) {
        let wifis = Object.keys(devs[dev]);
        for (let wifi of wifis) {
          //only grab devices in AP mode
          if (typeFilter) {
            if (!devs[dev][wifi].type.includes(typeFilter)) continue;
          }
          //ignore vlans
          if (wifi.includes('.')) continue;
          ifaces = ifaces.concat(wifi);
        }
      }

      ifaces = ifaces.sort();
      return ifaces;
    });
  }

  interfacesApi(api, typeFilter) {
    //look up the interfaces from iw/dev
    return api.iwDev().then((devs) => {
      let ifaces = [];
      for (let dev of Object.keys(devs)) {
        let wifis = Object.keys(devs[dev]);
        for (let wifi of wifis) {
          //only grab devices in AP mode
          if (typeFilter) {
            if (!devs[dev][wifi].type.includes(typeFilter)) continue;
          }
          //ignore vlans
          if (wifi.includes('.')) continue;
          ifaces = ifaces.concat(wifi);
        }
      }

      ifaces = ifaces.sort();
      return ifaces;
    });
  }

  defaultInterface() {
    return new Promise((resolve, reject) => {
      this.interfaces('AP')
        .then((ifaces) => {
          if (!ifaces.length) {
            reject('missing AP interface');
          }

          resolve(ifaces[0]);
        })
        .catch(reject);
    });
  }

  //TBD this is in the wrong spot. Needs its own plugin.
  asn(ip) {
    return this.get(`/plugins/lookup/asn/${ip}`);
  }
  asns(ips) {
    if (typeof ips === 'string') {
      ips = ips.split(',');
    }

    return this.get(`/plugins/lookup/asns/${ips.join(',')}`);
  }
}

export const wifiAPI = new APIWifi()
