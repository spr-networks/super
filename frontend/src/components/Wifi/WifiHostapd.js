import React, { useEffect, useState } from 'react'

import { wifiAPI } from 'api'
import { ucFirst } from 'utils'

import {
  Box,
  Button,
  Divider,
  HStack,
  Input,
  Text,
  VStack,
  useColorModeValue
} from 'native-base'

import WifiChannelParameters from 'components/Wifi/WifiChannelParameters'

const default5Ghz = {
          ap_isolate: 1,
          auth_algs: 1,
          channel: 36,
          country_code: 'US',
          ctrl_interface: '/state/wifi/control_wlan',
          ht_capab: '[LDPC][HT40+][HT40-][GF][SHORT-GI-20][SHORT-GI-40][TX-STBC][RX-STBC1]',
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
          vht_capab: '[RXLDPC][SHORT-GI-80][TX-STBC-2BY1][RX-STBC-1][MAX-A-MPDU-LEN-EXP3][RX-ANTENNA-PATTERN][TX-ANTENNA-PATTERN]',
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
          ht_capab: '[LDPC][HT40+][HT40-][GF][SHORT-GI-20][SHORT-GI-40][TX-STBC][RX-STBC1]',
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
  const [iface, setIface] = useState('wlan1')
  const [updated, setUpdated] = useState(false)
  const [config, setConfig] = useState({})
  const canEditString = ['ssid', 'country_code', 'vht_capab', 'ht_capab', 'hw_mode']
  const canEditInt = ['ieee80211ax', 'he_su_beamformer', 'he_su_beamformee', 'he_mu_beamformer']
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
    wifiAPI.config(iface).then((conf) => {
      setConfig(sortConf(conf))
    }).catch(err => {
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
    wifiAPI.enableInterface(iface)
    .then(
      wifiAPI.config(iface).then((conf) => {
        setConfig(sortConf(conf))
      }).catch(err => {
        //configuration not found. How to handle?
        setConfig({})
      })
    )
    .catch(
      setConfig({})
    )
  }

  const disableInterface = () => {
    //call hostapd
    wifiAPI.disableInterface(iface)
    .then(
      //TBD: alert?
      setConfig({})
    )
    .catch(
      setConfig({})
    )
  }


  const updateChannels = (wifiParameters) => {
    let data = {
      Channel: wifiParameters.Channel,
      Hw_mode: wifiParameters.Mode,
      Vht_oper_centr_freq_seg0_idx: wifiParameters.Vht_oper_centr_freq_seg0_idx,
      He_oper_centr_freq_seg0_idx: wifiParameters.He_oper_centr_freq_seg0_idx,
      Vht_oper_chwidth: wifiParameters.Vht_oper_chwidth,
      He_oper_chwidth: wifiParameters.He_oper_chwidth
    }

    if (wifiParameters.Mode == 'b' || wifiParameters.Mode == 'g') {
      //empty out VHT capabilities for b/g mode
      data.Vht_capab = ""
    } else if (wifiParameters.Mode == 'a') {
      //hack for mediatek.... TBD need to calculate these instead
      //re-enable VHT capab
      data.Vht_capab = default5Ghz.vht_capab
    }

    wifiAPI.updateConfig(iface, data).then((config) => {
      setConfig(sortConf(config))
    })
  }

  return (
    <>
      <WifiChannelParameters  iface={iface} setIface={setIface} config={config} notifyChange={updateChannels} />

      {config.interface !== undefined ? (
        <Button
          colorScheme="primary"
          size="md"
          width="50%"
          alignSelf="center"
          type="submit"
          mt={4}
          onPress={disableInterface}
        >
          Disable HostAP Configuration
        </Button>
      ) : null}

      <Box
        bg={useColorModeValue('warmGray.50', 'blueGray.800')}
        rounded="md"
        width="100%"
        p={4}
        mt={4}
      >
        <VStack space={2}>
          {config.interface == undefined ? (
            <Button
              colorScheme="primary"
              size="md"
              width="50%"
              alignSelf="center"
              type="submit"
              mt={4}
              onPress={generateHostAPConfiguration}
            >
              Generate HostAP Configuration
            </Button>
          ) :  (Object.keys(config).map((label) => (
              <HStack key={label} space={4} justifyContent="center">
                <Text bold w="1/4" textAlign="right">
                  {label}
                </Text>

                {canEdit.includes(label) ? (
                  <Input
                    size="lg"
                    type="text"
                    variant="underlined"
                    w="1/4"
                    value={config[label]}
                    onChangeText={(value) => handleChange(label, value)}
                    onSubmitEditing={handleSubmit}
                    onMouseLeave={handleSubmit}
                  />)
                  :
                  (
                    <Text w="1/4">{config[label]}</Text>
                  )
                }

              </HStack>
            ))
          )}

        </VStack>
      </Box>
    </>
  )

  /*
  return (
    <>
    <Form onSubmit={handleSubmit}>
      <Row>
        <Col>
          {Object.keys(config).map((label) => (
            <Row key={label}>
              <Label sm="3" className="sm-text-right">
                {label}
              </Label>
              <Col sm="9">
                <FormGroup className="row" key={label}>
                  <Input
                    autoFocus
                    type="text"
                    disabled={!canEdit.includes(label)}
                    className="col-sm-9"
                    name={label}
                    value={config[label]}
                    onChange={handleChange}
                  />
                </FormGroup>
              </Col>
            </Row>
          ))}
        </Col>
      </Row>

      <p className="text-center text-muted mt-4">
        <em>NOTE:</em> Editing hostapd.conf requires restarting the Wifi &amp;
        your connection will be dropped
      </p>

      <Row className="mt-4">
        <Col sm={{ offset: 0, size: 12 }} className="text-center">
          <Button
            className="btn-wd"
            color="primary"
            size="md"
            type="submit"
            onClick={handleSubmit}
          >
            Save
          </Button>
        </Col>
      </Row>
    </Form>
    </>
  )
*/
}

export default WifiHostapd
