import API from './API'



const default5Ghz = {
  ap_isolate: 1,
  auth_algs: 1,
  channel: 36,
  country_code: 'US',
  ctrl_interface: '/state/wifi/control_wlan',
  ht_capab:
    '[LDPC][HT40+][HT40-][GF][SHORT-GI-20][SHORT-GI-40][TX-STBC][RX-STBC1]',
  hw_mode: 'a',
  ieee80211ac: 1,
  ieee80211d: 1,
  ieee80211n: 1,
  ieee80211w: 1,
  interface: 'wlan',
  multicast_to_unicast: 1,
  per_sta_vif: 1,
  preamble: 1,
  rsn_pairwise: 'CCMP',
  sae_pwe: 2,
  sae_psk_file: '/configs/wifi/sae_passwords',
  ssid: 'TestLab',
  tdls_prohibit: 1,
  vht_capab:
    '[RXLDPC][SHORT-GI-80][TX-STBC-2BY1][RX-STBC-1][MAX-A-MPDU-LEN-EXP3][RX-ANTENNA-PATTERN][TX-ANTENNA-PATTERN]',
  vht_oper_centr_freq_seg0_idx: 42,
  vht_oper_chwidth: 1,
  wmm_enabled: 1,
  wpa: 2,
  wpa_disable_eapol_key_retries: 1,
  wpa_key_mgmt: 'WPA-PSK WPA-PSK-SHA256 SAE',
  wpa_psk_file: '/configs/wifi/wpa2pskfile'
}

const default2Ghz = {
  ap_isolate: 1,
  auth_algs: 1,
  channel: 1,
  country_code: 'US',
  ctrl_interface: '/state/wifi/control_wlan',
  ht_capab:
    '[LDPC][HT40+][HT40-][GF][SHORT-GI-20][SHORT-GI-40][TX-STBC][RX-STBC1]',
  hw_mode: 'g',
  ieee80211ac: 1,
  ieee80211d: 1,
  ieee80211n: 1,
  ieee80211w: 1,
  interface: 'wlan',
  multicast_to_unicast: 1,
  per_sta_vif: 1,
  preamble: 1,
  rsn_pairwise: 'CCMP',
  sae_pwe: 2,
  sae_psk_file: '/configs/wifi/sae_passwords',
  ssid: 'TestLab',
  tdls_prohibit: 1,
  wmm_enabled: 1,
  wpa: 2,
  wpa_disable_eapol_key_retries: 1,
  wpa_key_mgmt: 'WPA-PSK WPA-PSK-SHA256 SAE',
  wpa_psk_file: '/configs/wifi/wpa2pskfile'
}

const default6GHz = JSON.parse(JSON.stringify(default5Ghz))

const htCapab = [
  '[LDPC]',
  '[HT40-]',
  '[HT40+]',
  '[GF]',
  '[SHORT-GI-20]',
  '[SHORT-GI-40]',
  '[TX-STBC]',
  '[RX-STBC1]',
  '[RX-STBC12]',
  '[RX-STBC123]',
  '[DELAYED-BA]',
  '[MAX-AMSDU-7935]',
  '[DSSS_CCK-40]',
  '[40-INTOLERANT]',
  '[LSIG-TXOP-PROT]'
]

const vhtCapab = [
  '[MAX-MPDU-7991]',
  '[MAX-MPDU-11454]',
  '[VHT160]',
  '[VHT160-80PLUS80]',
  '[RXLDPC]',
  '[SHORT-GI-80]',
  '[SHORT-GI-160]',
  '[TX-STBC-2BY1]',
  '[RX-STBC-1]',
  '[RX-STBC-12]',
  '[RX-STBC-123]',
  '[RX-STBC-1234]',
  '[SU-BEAMFORMER]',
  '[SU-BEAMFORMEE]',
  '[BF-ANTENNA-2]',
  '[BF-ANTENNA-3]',
  '[BF-ANTENNA-4]',
  '[SOUNDING-DIMENSION-2]',
  '[SOUNDING-DIMENSION-3]',
  '[SOUNDING-DIMENSION-4]',
  '[MU-BEAMFORMER]',
  '[VHT-TXOP-PS]',
  '[HTC-VHT]',
  '[MAX-A-MPDU-LEN-EXP7]',
  '[MAX-A-MPDU-LEN-EXP6]',
  '[MAX-A-MPDU-LEN-EXP5]',
  '[MAX-A-MPDU-LEN-EXP4]',
  '[MAX-A-MPDU-LEN-EXP3]',
  '[MAX-A-MPDU-LEN-EXP2]',
  '[MAX-A-MPDU-LEN-EXP1]',
  '[VHT-LINK-ADAPT2]',
  '[VHT-LINK-ADAPT3]',
  '[RX-ANTENNA-PATTERN]',
  '[TX-ANTENNA-PATTERN]'
]

const mapHTCapabilities = (capStr) => {
  // Extract HT capabilities bitfield from the
  const htCapa = parseInt(capStr, 16)

  const parsedOutput = []

  // Check capabilities using bitwise operations
  if (htCapa & (1 << 0)) {
    parsedOutput.push('[LDPC]')
  }

  if (htCapa & (1 << 1)) {
    //supports HT40+/-
    parsedOutput.push('[HT40+]')
    parsedOutput.push('[HT40-]')
  }

  if (htCapa & (1 << 4)) {
    parsedOutput.push('[GF]')
  }
  if (htCapa & (1 << 5)) {
    parsedOutput.push('[SHORT-GI-20]')
  }
  if (htCapa & (1 << 6)) {
    parsedOutput.push('[SHORT-GI-40]')
  }
  if (htCapa & (1 << 7)) {
    parsedOutput.push('[TX-STBC]')
  }

  if (htCapa & (1 << 8) && htCapa & (1 << 9)) {
    parsedOutput.push('[RX-STBC123]')
  } else if (htCapa & (1 << 9)) {
    parsedOutput.push('[RX-STBC12]')
  } else if (htCapa & (1 << 8)) {
    parsedOutput.push('[RX-STBC1]')
  }

  if (htCapa & (1 << 10)) {
    parsedOutput.push('[DELAYED-BA]')
  }
  if (htCapa & (1 << 11)) {
    parsedOutput.push('[MAX-AMSDU-7935]')
  }
  if (htCapa & (1 << 12)) {
    parsedOutput.push('[DSSS_CCK-40]')
  }
  if (htCapa & (1 << 14)) {
    parsedOutput.push('[40-INTOLERANT]')
  }

  if (htCapa & (1 << 15)) {
    parsedOutput.push('[LSIG-TXOP-PROT]')
  }

  return parsedOutput
}

const mapVHTCapabilities = (capStr) => {
  const capa = parseInt(capStr, 16)

  const parsedOutput = []

  // Check capabilities using bitwise operations
  if (capa & (1 << 0)) {
    parsedOutput.push('[MAX-MPDU-7991]')
  }
  if (capa & (1 << 1)) {
    parsedOutput.push('[MAX-MPDU-11454]')
  }
  if (capa & (1 << 2)) {
    parsedOutput.push('[VHT160]')
  }
  //note: if both 2 and 3 are set, then this is incorrect
  if (capa & (1 << 3)) {
    parsedOutput.push('[VHT160-80PLUS80]')
  }
  if (capa & (1 << 4)) {
    parsedOutput.push('[RXLDPC]')
  }
  if (capa & (1 << 5)) {
    parsedOutput.push('[SHORT-GI-80]')
  }
  if (capa & (1 << 6)) {
    parsedOutput.push('[SHORT-GI-160]')
  }
  if (capa & (1 << 7)) {
    parsedOutput.push('[TX-STBC-2BY1]')
  }

  switch ((capa & 0x700) >> 8) {
    case 1:
      parsedOutput.push('[RX-STBC-1]')
      break
    case 2:
      parsedOutput.push('[RX-STBC-12]')
      break
    case 3:
      parsedOutput.push('[RX-STBC-123]')
      break
    case 4:
      parsedOutput.push('[RX-STBC-1234]')
      break
    case 5:
      parsedOutput.push('[RX-STBC-1234]')
      break //hostapd does not support 5 yet
    case 6:
      parsedOutput.push('[RX-STBC-1234]')
      break //hostapd does not support 6 yet
    case 7:
      parsedOutput.push('[RX-STBC-1234]')
      break //hostapd does not support 7 yet
    default:
      break
  }

  if (capa & (1 << 11)) {
    parsedOutput.push('[SU-BEAMFORMER]')
  }
  if (capa & (1 << 12)) {
    parsedOutput.push('[SU-BEAMFORMEE]')
  }

  let beamformingAntennas = ((capa & 0xe000) >> 13) + 1
  if (beamformingAntennas > 1) {
    parsedOutput.push('[BF-ANTENNA-' + beamformingAntennas + ']')
  }

  let soundingDimensions = ((capa & 0x70000) >> 16) + 1
  if (soundingDimensions > 1) {
    parsedOutput.push('[SOUNDING-DIMENSION-' + soundingDimensions + ']')
  }

  if (capa & (1 << 19)) {
    parsedOutput.push('[MU-BEAMFORMER]')
  }
  if (capa & (1 << 21)) {
    parsedOutput.push('[VHT-TXOP-PS]')
  }
  if (capa & (1 << 22)) {
    parsedOutput.push('[HTC-VHT]')
  }

  let aMPDUExp = (capa & 0x3800000) >> 23

  if (aMPDUExp > 0) {
    parsedOutput.push('[MAX-A-MPDU-LEN-EXP' + aMPDUExp + ']')
  }

  if (capa & (1 << 28)) {
    parsedOutput.push('[RX-ANTENNA-PATTERN]')
  }
  if (capa & (1 << 29)) {
    parsedOutput.push('[TX-ANTENNA-PATTERN]')
  }

  let vhtAdapt = (capa & 0xc000000) >> 26
  if (vhtAdapt == 2 || vhtAdapt == 3) {
    parsedOutput.push('[VHT-LINK-ADAPT' + vhtAdapt + ']')
  }

  return parsedOutput
}

const filterHTCapabilities = (capstr, defaultstr) => {
  let available = mapHTCapabilities(capstr)
  let settings = defaultstr.split('[')
  for (let setting of settings) {
    if (setting == '') continue
    setting = '[' + setting
    if (available.indexOf(setting) == -1) {
      defaultstr = defaultstr.replace(setting, '')
    }
  }
  return defaultstr
}

const filterVHTCapabilities = (capstr, defaultstr) => {
  let available = mapVHTCapabilities(capstr)
  let settings = defaultstr.split('[')
  for (let setting of settings) {
    if (setting == '') continue
    setting = '[' + setting
    if (available.indexOf(setting) == -1) {
      defaultstr = defaultstr.replace(setting, '')
    }
  }
  return defaultstr
}

const filterCapabilities = (template, ht_capstr, vht_capstr, band) => {
  //deep copy template
  let config = JSON.parse(JSON.stringify(template))
  if (band == 1) {
    //delete vht_capab from config
    if ('vht_capab' in config) {
      delete config.vht_capab
    }
    //filter ht
    config.ht_capab = filterHTCapabilities(ht_capstr, config.ht_capab)
  } else if (band == 2) {
    //filter ht and vht capab in config
    config.ht_capab = filterHTCapabilities(ht_capstr, config.ht_capab)
    config.vht_capab = filterVHTCapabilities(vht_capstr, config.vht_capab)
  } else if (band == 4) {
    //6ghz: anythign else?
    //filter both ht and vht
    config.ht_capab = filterHTCapabilities(ht_capstr, config.ht_capab)
    config.vht_capab = filterVHTCapabilities(vht_capstr, config.vht_capab)
  }

  return config
}


export const generateCapabilitiesString = (iwmap, iface, wanted_band) => {
  let iwinfo = iwmap[iface]
  let ht_capstr = ''
  let vht_capstr = ''

  if (iwinfo == undefined) {
    return ['', '']
  }

  for (let i = 0; i < iwinfo.bands.length; i++) {
    let band = iwinfo.bands[i].band
    let ht_capstr = ''
    let vht_capstr = ''

    if (iwinfo.bands[i].capabilities != undefined) {
      ht_capstr = iwinfo.bands[i].capabilities[0]
    }

    if (iwinfo.bands[i].vht_capabilities != undefined) {
      vht_capstr = iwinfo.bands[i].vht_capabilities[0]
    }

    if (band.includes('Band 2') && wanted_band == 2) {
      return [mapHTCapabilities(ht_capstr), mapVHTCapabilities(vht_capstr)]
    } else if (band.includes('Band 1') && wanted_band == 1) {
      return [mapHTCapabilities(ht_capstr), mapVHTCapabilities(vht_capstr)]
    } else if (band.includes('Band 4') && wanted_band == 4) {
      return [mapHTCapabilities(ht_capstr), mapVHTCapabilities(vht_capstr)]
    }
  }

  return ['', '']
}

export const generateConfigForBand = (iwmap, iface, wanted_band) => {
  let iwinfo = iwmap[iface]
  let has_wifi6 = false
  let ht_capstr = ''
  let vht_capstr = ''

  let defaultConfig = {}

  for (let i = 0; i < iwinfo.bands.length; i++) {
    let band = iwinfo.bands[i]
    if (band.he_phy_capabilities) {
      has_wifi6 = true
    }

    let ht_capstr = ''
    let vht_capstr = ''

    if (iwinfo.bands[i].capabilities != undefined) {
      ht_capstr = iwinfo.bands[i].capabilities[0]
    }

    if (iwinfo.bands[i].vht_capabilities != undefined) {
      vht_capstr = iwinfo.bands[i].vht_capabilities[0]
    }

    if (band.band.includes('Band 2') && wanted_band == 2) {
      defaultConfig = filterCapabilities(
        default5Ghz,
        ht_capstr,
        vht_capstr,
        2
      )
      break
    } else if (band.band.includes('Band 1') && wanted_band == 1) {
      defaultConfig = filterCapabilities(
        default2Ghz,
        ht_capstr,
        vht_capstr,
        1
      )
      break
    } else if (band.band.includes('Band 4') && wanted_band == 4) {
      defaultConfig = filterCapabilities(
        default6GHz,
        ht_capstr,
        vht_capstr,
        4
      )
      break
    }
  }

  //got no config, return empty
  if (defaultConfig.ap_isolate != 1) {
    return null
  }

  //enable wifi 6 by default
  if (has_wifi6 == true) {
    defaultConfig.he_mu_beamformer = '1'
    defaultConfig.he_su_beamformee = '1'
    defaultConfig.he_su_beamformer = '1'
    defaultConfig.ieee80211ax = '1'
  } else {
    defaultConfig.he_mu_beamformer = '0'
    defaultConfig.he_su_beamformee = '0'
    defaultConfig.he_su_beamformer = '0'
    defaultConfig.ieee80211ax = '0'
  }

  return defaultConfig
}

export const isSPRCompat = (iw) => {
  if (iw.supported_ciphers.includes('GCMP-128 (00-0f-ac:8)') &&
    iw.supported_interface_modes.includes("AP/VLAN")) {
      return true
  }
  return false
}

export const getBestWifiConfig = (iwMap, iface, config) => {
  let new_config = { ...config }

  //enable all capabilities

  let ht_capab, vht_capab
  if (config.hw_mode == 'a') {
    //this assumes 5ghz, need to handle 6ghz and wifi 6
    ;[ht_capab, vht_capab] = generateCapabilitiesString(iwMap, iface, 2)
  } else if (config.hw_mode == 'g' || config.hw_mode == 'b') {
    ;[ht_capab, vht_capab] = generateCapabilitiesString(iwMap, iface, 1)
  } else {
    ;[ht_capab, vht_capab] = generateCapabilitiesString(iwMap, iface, 2)
    if (ht_capab == '' && vht_capab == '') {
      ;[ht_capab, vht_capab] = generateCapabilitiesString(iwMap, iface, 1)
    }
    if (ht_capab == '' && vht_capab == '') {
      ;[ht_capab, vht_capab] = generateCapabilitiesString(iwMap, iface, 4)
    }
  }
  if (ht_capab) {
    ht_capab.sort()
    new_config.ht_capab = ht_capab.join('')
  }
  if (vht_capab) {
    vht_capab.sort()
    new_config.vht_capab = vht_capab.join('')
  }

  return new_config
}

//make sure to update commitConfig when updating these
const canEditString = [
  'ssid',
  'country_code',
  'vht_capab',
  'ht_capab',
  'hw_mode'
]
const canEditInt = [
  'ieee80211ax',
  'he_su_beamformer',
  'he_su_beamformee',
  'he_mu_beamformer'
]
const canEdit = canEditInt.concat(canEditString)


const decodeUTF8 = (str) => {
  const x = str.replace(/\\x([0-9A-Fa-f]{2})/g, (_, p1) =>
    String.fromCharCode(parseInt(p1, 16))
  );

  return decodeURIComponent(escape(x))
}

export const sortConf = (conf) => {
  // put the ones we can change at the top
  //force ssid at the top
  return Object.keys(conf)
    .sort((a, b) => {
      if (a == 'ssid') {
        return -1
      }
      if (canEdit.includes(a)) {
        if (canEdit.includes(b)) {
          return a > b ? 1 : a < b ? -1 : 0
        }
        return -1
      }

      return a > b ? 1 : a < b ? -1 : 0
    })
    .reduce((obj, key) => {
      obj[key] = conf[key]
      return obj
    }, {})
}

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
    return this.get(`hostapd/${iface}/status`).then((status) => {
      if (status['ssid[0]']) {
        status['ssid[0]'] = decodeUTF8(status['ssid[0]'])
      }
      return status;
    });
  }

  checkFailsafe(iface) {
    return this.get(`hostapd/${iface}/failsafe`);
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

  restartSetupWifi() {
    return this.put(`hostapd/restart_setup`);
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
          //ignore the set up ap
          if (typeFilter == 'AP' && devs[dev][wifi].ssid === 'spr-setup') continue;
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
