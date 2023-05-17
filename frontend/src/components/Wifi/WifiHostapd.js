import React, { useContext, useEffect, useState } from 'react'

import { wifiAPI } from 'api'
import { AlertContext } from 'AppContext'

import { Platform } from 'react-native'

import {
  Box,
  Button,
  FormControl,
  Heading,
  HStack,
  Input,
  Menu,
  ScrollView,
  Select,
  Text,
  Tooltip,
  VStack,
  useColorModeValue
} from 'native-base'

import WifiChannelParameters from 'components/Wifi/WifiChannelParameters'
import { Icon } from 'FontAwesomeUtils'
import { faRotateRight, faWifi } from '@fortawesome/free-solid-svg-icons'

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
  sae_psk_file: '/configs/wifi/sae_passwords',
  ssid: 'TestLab',
  tdls_prohibit: 1,
  wmm_enabled: 1,
  wpa: 2,
  wpa_disable_eapol_key_retries: 1,
  wpa_key_mgmt: 'WPA-PSK WPA-PSK-SHA256 SAE',
  wpa_psk_file: '/configs/wifi/wpa2pskfile'
}

const default6Ghz = JSON.parse(JSON.stringify(default5Ghz))

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

function mapHTCapabilities(capStr) {
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

function mapVHTCapabilities(capStr) {
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

const WifiHostapd = (props) => {
  const context = useContext(AlertContext)
  const [iface, setIface] = useState('')
  const [interfaceEnabled, setInterfaceEnabled] = useState(true)
  const [interfaces, setInterfaces] = useState([])

  const [updated, setUpdated] = useState(false)
  const [config, setConfig] = useState({})
  const [tooltips, setTooltips] = useState({})
  const [devices, setDevices] = useState([])
  const [iws, setIws] = useState([])
  const [iwMap, setIwMap] = useState({})

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

  const sortConf = (conf) => {
    // put the ones we can change at the top
    return Object.keys(conf)
      .sort((a, b) => {
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

  const updateCapabilitiesTooltips = () => {
    //update the tooltips for vht_capab, ht_capab

    let ht_capab, vht_capab
    if (config.hw_mode == 'a') {
      //this assumes 5ghz, need to handle 6ghz and wifi 6
      [ht_capab, vht_capab] = generateCapabilitiesString(iface, 2)
    } else if (config.hw_mode == 'g' || config.hw_mode == 'b') {
      [ht_capab, vht_capab] = generateCapabilitiesString(iface, 1)
    } else {
      [ht_capab, vht_capab] = generateCapabilitiesString(iface, 2)
      if (ht_capab == '' && vht_capab == '') {
        [ht_capab, vht_capab] = generateCapabilitiesString(iface, 1)
      }
      if (ht_capab == '' && vht_capab == '') {
        [ht_capab, vht_capab] = generateCapabilitiesString(iface, 4)
      }
    }

    if (ht_capab || vht_capab) {
      setTooltips({ ht_capab: ht_capab, vht_capab: vht_capab })
    }
  }

  const updateCapabilities = () => {

    let new_config = {...config}


    //enable all capabilities

    let ht_capab, vht_capab
    if (config.hw_mode == 'a') {
      //this assumes 5ghz, need to handle 6ghz and wifi 6
      [ht_capab, vht_capab] = generateCapabilitiesString(iface, 2)
    } else if (config.hw_mode == 'g' || config.hw_mode == 'b') {
      [ht_capab, vht_capab] = generateCapabilitiesString(iface, 1)
    } else {
      [ht_capab, vht_capab] = generateCapabilitiesString(iface, 2)
      if (ht_capab == '' && vht_capab == '') {
        [ht_capab, vht_capab] = generateCapabilitiesString(iface, 1)
      }
      if (ht_capab == '' && vht_capab == '') {
        [ht_capab, vht_capab] = generateCapabilitiesString(iface, 4)
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

    pushConfig(new_config)
  }


  const updateIWS = () => {
    wifiAPI.iwDev().then((devs) => {
      setDevices(devs)

      wifiAPI.iwList().then((iws) => {
        iws = iws.map((iw) => {
          iw.devices = devs[iw.wiphy]
          return iw
        })

        //make a phy to iws map and devname to iw map
        let iwMap = {}
        iws.forEach((iw) => {
          iwMap[iw.wiphy] = iw
          Object.keys(iw.devices).forEach((dev) => {
            iwMap[dev] = iw
          })
        })
        setIwMap(iwMap)
        setIws(iws)
      })
    })
  }

  useEffect(() => {
    if (iwMap && iwMap[iface] && config.interface && iface != '') {
      updateCapabilitiesTooltips()
    }
  }, [iws, config, iface])

  useEffect(() => {
    //in the future: maybe poll for refreshing this.
    updateIWS()

    if (iface == '') {
      wifiAPI.defaultInterface().then((defIface) => {
        setIface(defIface)
      })
    }

    if (iface == '') {
      return
    }

    //extract the interface state
    wifiAPI.interfacesConfiguration().then((ifaces) => {
      setInterfaces(ifaces)
      for (const i of ifaces) {
        if (i.Name == iface) {
          setInterfaceEnabled(i.Enabled)
          break
        }
      }
    })

    wifiAPI
      .config(iface)
      .then((conf) => {
        setConfig(sortConf(conf))
      })
      .catch((err) => {
        //configuration not found. How to handle?
        setConfig({})
      })
  }, [iface])

  const handleChange = (name, value) => {
    setUpdated(true)
    let configNew = { ...config }
    if (canEditInt.includes(name)) {
      if (isNaN(parseFloat(value))) {
        return
      }
      //cast to a number
      value = parseInt(value)
    }
    configNew[name] = value

    setConfig(configNew)
  }

  const pushConfig = (inconfig) => {

    let data = {
      Ssid: inconfig.ssid,
      Channel: parseInt(inconfig.channel),
      Country_code: inconfig.country_code,
      Vht_capab: inconfig.vht_capab,
      Ht_capab: inconfig.ht_capab,
      Hw_mode: inconfig.hw_mode,
      Ieee80211ax: parseInt(inconfig.ieee80211ax),
      He_su_beamformer: parseInt(inconfig.he_su_beamformer),
      He_su_beamformee: parseInt(inconfig.he_su_beamformee),
      He_mu_beamformer: parseInt(inconfig.he_mu_beamformer)
    }

    wifiAPI.updateConfig(iface, data).then((curConfig) => {
      setConfig(curConfig)
    })
  }

  const commitConfig = () => {

    let data = {
      Ssid: config.ssid,
      Channel: parseInt(config.channel),
      Country_code: config.country_code,
      Vht_capab: config.vht_capab,
      Ht_capab: config.ht_capab,
      Hw_mode: config.hw_mode,
      Ieee80211ax: parseInt(config.ieee80211ax),
      He_su_beamformer: parseInt(config.he_su_beamformer),
      He_su_beamformee: parseInt(config.he_su_beamformee),
      He_mu_beamformer: parseInt(config.he_mu_beamformer)
    }

    wifiAPI.updateConfig(iface, data).then((curConfig) => {
      setConfig(curConfig)
    })
  }

  const handleSubmit = () => {
    if (updated == false) {
      return
    }

    setUpdated(false)

    commitConfig()
  }

  const generateCapabilitiesString = (iface, wanted_band) => {
    let iw_info = iwMap[iface]
    let ht_capstr = ''
    let vht_capstr = ''

    if (iw_info == undefined) {
      return ['', '']
    }

    for (let i = 0; i < iw_info.bands.length; i++) {
      let band = iw_info.bands[i].band
      let ht_capstr = ''
      let vht_capstr = ''

      if (iw_info.bands[i].capabilities != undefined) {
        ht_capstr = iw_info.bands[i].capabilities[0]
      }

      if (iw_info.bands[i].vht_capabilities != undefined) {
        vht_capstr = iw_info.bands[i].vht_capabilities[0]
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

  const generateConfigForBand = (iface, wanted_band) => {
    let iw_info = iwMap[iface]
    let ht_capstr = ''
    let vht_capstr = ''

    let defaultConfig

    for (let i = 0; i < iw_info.bands.length; i++) {
      let band = iw_info.bands[i].band
      let ht_capstr = ''
      let vht_capstr = ''

      if (iw_info.bands[i].capabilities != undefined) {
        ht_capstr = iw_info.bands[i].capabilities[0]
      }

      if (iw_info.bands[i].vht_capabilities != undefined) {
        vht_capstr = iw_info.bands[i].vht_capabilities[0]
      }

      if (band.includes('Band 2') && wanted_band == 2) {
        defaultConfig = filterCapabilities(
          default5Ghz,
          ht_capstr,
          vht_capstr,
          2
        )
        break
      } else if (band.includes('Band 1') && wanted_band == 1) {
        defaultConfig = filterCapabilities(
          default2Ghz,
          ht_capstr,
          vht_capstr,
          1
        )
      } else if (band.includes('Band 4') && wanted_band == 4) {
        defaultConfig = filterCapabilities(
          default6Ghz,
          ht_capstr,
          vht_capstr,
          4
        )
      }
    }

    return defaultConfig
  }

  const generateHostAPConfiguration = () => {
    //band 1 -> 2.4GHz
    //band 2 -> 5GHz
    //band 4 -> 6GHz
    //band 5 -> 900MHz

    //find iface in devices
    if (iwMap[iface] == undefined) {
      context.error('Interface not found')
      return
    }

    let iw_info = iwMap[iface]

    let defaultConfig
    //iterate through bands, looking for band 2, band 1, band 4 in that order

    defaultConfig =
      generateConfigForBand(iface, 2) ||
      generateConfigForBand(iface, 1) ||
      generateConfigForBand(iface, 4)

    if (defaultConfig == undefined) {
      context.error(
        'could not determine default hostap configuration. using a likely broken default'
      )
      return
    }

    let has_wifi6 = false

    for (let i = 0; i < iw_info.bands.length; i++) {
      let band = iw_info.bands[i]
      if (band.he_phy_capabilities) {
        has_wifi6 = true
        break
      }
    }

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

    pushConfig(defaultConfig)

    //set all vht/ht settings by default
    updateCapabilities()

    //call hostapd to enable the interface
    wifiAPI.enableInterface(iface).then(() => setInterfaceEnabled(true))
  }

  const disableInterface = () => {
    //call hostapd
    wifiAPI
      .disableInterface(iface)
      .then(() => {
        setConfig({})
        setInterfaceEnabled(false)
      })
      .catch(setConfig({}))
  }

  const resetInterfaceConfig = () => {
    wifiAPI.resetInterfaceConfig(iface).then(
      wifiAPI
        .config(iface)
        .then((conf) => {
          setConfig(sortConf(conf))
        })
        .catch((err) => {
          //configuration not found. How to handle?
          setConfig({})
        })
    )
  }

  const restartWifi = () => {
    wifiAPI.restartWifi().then()
  }

  // when selected and click save in channel form
  const updateChannels = (wifiParameters) => {
    let updateConfig = (params) => {
      let data = { ...params, ...wifiParameters }

      if (wifiParameters.Mode == 'b' || wifiParameters.Mode == 'g') {
        //empty out VHT capabilities for b/g mode
        data.Vht_capab = ''
      } else if (
        wifiParameters.Mode == 'a' &&
        (config.vht_capab == undefined || config.vht_capab == '')
      ) {
        //re-enable vht capabilities for 5GHz
        let tempConfig = generateConfigForBand(iface, 2)
        data.Vht_capab = tempConfig.vht_capab
      }

      data.Hw_mode = data.Mode

      wifiAPI
        .updateConfig(iface, data)
        .then((config) => {
          setConfig(sortConf(config))
          context.success(`${iface} config updated`)
        })
        .catch((e) => {
          context.error('API Failure: ' + e.message)
        })
    }

    wifiAPI
      .calcChannel(wifiParameters)
      .then(updateConfig)
      .catch((e) => {
        context.error('API Failure: ' + e.message)
      })
  }

  let devsSelect = []
  let devSelected = null
  for (let phy in devices) {
    for (let _iface in devices[phy]) {
      let type = devices[phy][_iface].type,
        label = `${_iface} ${type}`

      //skip VLAN & managed entries
      if (type.includes('AP/VLAN')) {
        continue
      }
      devsSelect.push({ label, value: _iface, isDisabled: (_iface.includes('.')) })

      if (_iface == iface) {
        devSelected = devsSelect[devsSelect.length - 1].value
      }
    }
  }

  const updateExtraBSS = (iface, params) => {
    wifiAPI.enableExtraBSS(iface, params).then((result) => {
      //update interfaces
      wifiAPI.interfacesConfiguration().then((ifaces) => {
        setInterfaces(ifaces)
        for (const i of ifaces) {
          if (i.Name == iface) {
            setInterfaceEnabled(i.Enabled)
            break
          }
        }
      })
    })
  }

  const deleteExtraBSS = (iface) => {
    wifiAPI.disableExtraBSS(iface).then((result) => {

      //update interfaces
      wifiAPI.interfacesConfiguration().then((ifaces) => {
        setInterfaces(ifaces)
        for (const i of ifaces) {
          if (i.Name == iface) {
            setInterfaceEnabled(i.Enabled)
            break
          }
        }
      })

    })
  }

  const triggerBtn = (triggerProps) => (
    <Button
      variant="subtle"
      size="sm"
      alignSelf="center"
      leftIcon={<Icon icon={faWifi} />}
      {...triggerProps}
    >
      {`${iface} Options`}
    </Button>
  )

  const interfaceMenu = (
    <Menu
      flex={1}
      w={190}
      closeOnSelect={true}
      trigger={triggerBtn}
      alignSelf="center"
    >
      <Menu.Group title="Actions">
        <Menu.Item onPress={disableInterface}>Disable HostAP Config</Menu.Item>
        <Menu.Item onPress={resetInterfaceConfig}>
          Reset HostAP Config
        </Menu.Item>
      </Menu.Group>
    </Menu>
  )

  let curIface
  for (let i of interfaces) {
    if (i.Name == iface) {
      curIface = i
    }
  }

  return (
    <ScrollView pb="20">
      <HStack justifyContent="space-between" alignItems="center" p={4}>
        <Heading fontSize="md">Wifi Interface</Heading>

        <Button
          colorScheme="secondary"
          size="sm"
          alignSelf="center"
          leftIcon={<Icon icon={faRotateRight} />}
          type="submit"
          onPress={restartWifi}
        >
          Restart All Wifi Devices
        </Button>
      </HStack>
      <Box
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        p={4}
      >
        <FormControl flex={1} w="2/3">
          <FormControl.Label>WiFi Interface</FormControl.Label>
          {devsSelect.length ? (
            <Select
              selectedValue={devSelected}
              onValueChange={(value) => setIface(value)}
              accessibilityLabel="Wifi Interface"
            >
              {devsSelect.map((dev) => (
                <Select.Item
                  key={dev.label}
                  label={dev.label}
                  value={dev.value}
                  isDisabled={dev.isDisabled}
                />
              ))}
            </Select>
          ) : null}
        </FormControl>
      </Box>

      <WifiChannelParameters
        iface={iface}
        iws={iws}
        curInterface={curIface}
        setIface={setIface}
        config={config}
        onSubmit={updateChannels}
        updateExtraBSS={updateExtraBSS}
        deleteExtraBSS={deleteExtraBSS}
      />

      <HStack justifyContent="space-between" p={4}>
        <Heading fontSize="lg" alignSelf="center">
          Advanced
        </Heading>
        <Heading fontSize="md" alignSelf="center">
          HostAP Config {iface}
        </Heading>
        {/*interfaceMenu*/}
        <HStack space={2}>
          <Button
            variant="solid"
            size="sm"
            alignSelf="center"
            _leftIcon={<Icon icon={faRotateRight} />}
            type="submit"
            onPress={updateCapabilities}
          >
            Update All Capabilities
          </Button>
          <Button
            variant="solid"
            colorScheme="secondary"
            size="sm"
            alignSelf="center"
            _leftIcon={<Icon icon={faRotateRight} />}
            type="submit"
            onPress={disableInterface}
          >
            {Platform.OS == 'web' ? 'Disable Radio Interface' : 'Disable'}
          </Button>
          <Button
            variant="solid"
            colorScheme="secondary"
            size="sm"
            alignSelf="center"
            _leftIcon={<Icon icon={faRotateRight} />}
            type="submit"
            onPress={resetInterfaceConfig}
          >
            Reset Config
          </Button>
        </HStack>
      </HStack>

      <Box
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        p={4}
      >
        <VStack space={2}>
          {config.interface && interfaceEnabled == true ? (
            Object.keys(config).map((label) => (
              <HStack
                key={label}
                space={4}
                justifyContent="center"
                alignItems="center"
              >
                <Text bold flex={1} textAlign="right">
                  {label}
                </Text>

                {canEdit.includes(label) ? (
                  tooltips[label] ? (
                    <Tooltip label={tooltips[label]}>
                      <Input
                        size="lg"
                        type="text"
                        variant="underlined"
                        flex={2}
                        value={config[label]}
                        onChangeText={(value) => handleChange(label, value)}
                        onSubmitEditing={handleSubmit}
                        onMouseLeave={handleSubmit}
                      />
                    </Tooltip>
                  ) : (
                    <Input
                      size="lg"
                      type="text"
                      variant="underlined"
                      flex={2}
                      value={config[label]}
                      onChangeText={(value) => handleChange(label, value)}
                      onSubmitEditing={handleSubmit}
                      onMouseLeave={handleSubmit}
                    />
                  )
                ) : (
                  <Text flex={2}>{config[label]}</Text>
                )}
              </HStack>
            ))
          ) : (
            <Button
              colorScheme="primary"
              size="md"
              width="50%"
              alignSelf="center"
              type="submit"
              mt={4}
              onPress={generateHostAPConfiguration}
            >
              Enable HostAP
            </Button>
          )}
        </VStack>
      </Box>
    </ScrollView>
  )
}

export default WifiHostapd
