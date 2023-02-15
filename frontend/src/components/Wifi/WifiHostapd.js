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
  View,
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

const WifiHostapd = (props) => {
  const context = useContext(AlertContext)
  const [iface, setIface] = useState('wlan1')

  const [updated, setUpdated] = useState(false)
  const [config, setConfig] = useState({})
  const [devices, setDevices] = useState([])
  const [iws, setIws] = useState([])

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

  useEffect(() => {
    wifiAPI.iwDev().then((devs) => {
      setDevices(devs)

      wifiAPI.iwList().then((iws) => {
        iws = iws.map((iw) => {
          iw.devices = devs[iw.wiphy]
          return iw
        })

        setIws(iws)
      })
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

  const handleSubmit = () => {
    if (updated == false) {
      return
    }

    setUpdated(false)
    let data = {
      Ssid: config.ssid,
      Channel: parseInt(config.channel)
    }

    wifiAPI.updateConfig(iface, data).then((config) => {
      setConfig(sortConf(config))
    })
  }

  const generateHostAPConfiguration = () => {
    //call hostapd
    wifiAPI
      .enableInterface(iface)
      .then(
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
      .catch(setConfig({}))
  }

  const disableInterface = () => {
    //call hostapd
    wifiAPI
      .disableInterface(iface)
      .then(
        //TBD: alert?
        setConfig({})
      )
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
      let data = {...params, ...wifiParameters}
      console.log(data)

      if (wifiParameters.Mode == 'b' || wifiParameters.Mode == 'g') {
        //empty out VHT capabilities for b/g mode
        data.Vht_capab = ''
      } else if (wifiParameters.Mode == 'a') {
        //hack for mediatek.... TBD need to calculate these instead
        //re-enable VHT capab
        data.Vht_capab = default5Ghz.vht_capab
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
      .setChannel(iface, wifiParameters)
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

      devsSelect.push({ label, value: _iface, disabled: !type.includes('AP') })

      if (_iface == iface) {
        devSelected = devsSelect[devsSelect.length - 1].value
      }
    }
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
      <Box bg={useColorModeValue('warmGray.50', 'blueGray.800')} p={4}>
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
                />
              ))}
            </Select>
          ) : null}
        </FormControl>
      </Box>

      <WifiChannelParameters
        iface={iface}
        iws={iws}
        setIface={setIface}
        config={config}
        onSubmit={updateChannels}
      />

      <HStack justifyContent="space-between" p={4}>
        <Heading fontSize="md" alignSelf="center">
          HostAP Config {iface}
        </Heading>
        {/*interfaceMenu*/}
        <HStack space={2}>
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

      <Box bg={useColorModeValue('warmGray.50', 'blueGray.800')} p={4}>
        <VStack space={2}>
          {config.interface ? (
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
