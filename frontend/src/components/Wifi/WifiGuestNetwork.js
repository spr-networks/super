import React, { useContext, useEffect, useState } from 'react'

import { wifiAPI } from 'api'

import {
  generateCapabilitiesString,
  generateConfigForBand,
  getBestWifiConfig,
  sortConf,
  isSPRCompat
} from 'api/Wifi'

import { AlertContext } from 'AppContext'

import { Platform } from 'react-native'

import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  FormControlError,
  FormControlErrorText,
  Heading,
  HStack,
  Input,
  InputField,
  ScrollView,
  Text,
  TooltipText,
  TooltipContent,
  VStack
} from '@gluestack-ui/themed'

import { Tooltip as TooltipOrig } from '@gluestack-ui/themed'

import { RotateCwIcon, WifiIcon } from 'lucide-react-native'

import { Select } from 'components/Select'
import { Tooltip } from 'components/Tooltip'
import WifiGuestNetworkParameters from 'components/Wifi/WifiGuestNetworkParameters'
import { ListHeader } from 'components/List'


const WifiGuestNetwork = (props) => {
  const context = useContext(AlertContext)
  const [iface, setIface] = useState('')
  const [interfaceEnabled, setInterfaceEnabled] = useState(true)
  const [interfaces, setInterfaces] = useState([])

  const [updated, setUpdated] = useState(false)
  const [config, setConfig] = useState({})
  const [tooltips, setTooltips] = useState({})
  const [devices, setDevices] = useState([])
  const [iws, setIws] = useState([])
  const [regs, setRegs] = useState({})
  const [iwMap, setIwMap] = useState({})

  const [failsafeErrors, setFailsafeErrors] = useState('FAIL')


  const updateIWS = () => {
    wifiAPI.iwDev().then((devs) => {
      setDevices(devs)

      wifiAPI
        .iwReg()
        .then((regs) => {
          setRegs(regs)
        })
        .catch((e) => {})

      wifiAPI.iwList().then(async (iws) => {
        iws = await Promise.all(
          iws.map(async (iw) => {
            iw.devices = devs[iw.wiphy]
            iw.failsafeStatus = await wifiAPI.checkFailsafe(iw.wiphy)
            return iw
          })
        )

        //make a phy to iws map and devname to iw map
        let iwMap = {}
        iws.forEach((iw) => {
          iwMap[iw.wiphy] = iw
          Object.keys(iw.devices).forEach((dev) => {
            if (isSPRCompat(iw)) {
              iw.spr_compat = true
            } else {
              iw.spr_compat = false
            }
            iwMap[dev] = iw
            iwMap[iw.wiphy].dev = dev
          })
        })

        iws = await Promise.all(
          iws.map(async (iw) => {
            iw.failsafeStatus = await wifiAPI.checkFailsafe(iwMap[iw.wiphy].dev)
            return iw
          })
        )

        setIwMap(iwMap)
        setIws(iws)
      })
    })
  }

  useEffect(() => {
    //in the future: maybe poll for refreshing this.
    updateIWS()

    if (iface == '') {
      wifiAPI
        .defaultInterface()
        .then((defIface) => {
          setIface(defIface)
        })
        .catch((e) => {})
    }

    if (iface === '') {
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
        context.error('failed to retrieve configuration for ' + iface, err)
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
      setConfig(sortConf(curConfig))
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
      setConfig(sortConf(curConfig))
    })
  }

  const handleSubmit = () => {
    if (updated == false) {
      return
    }

    setUpdated(false)

    commitConfig()
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
      generateConfigForBand(iwMap, iface, 2) ||
      generateConfigForBand(iwMap, iface, 1) ||
      generateConfigForBand(iwMap, iface, 4)

    if (defaultConfig == undefined) {
      context.error(
        'could not determine default hostap configuration. using a likely broken default'
      )
      return
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
    let prevSSID = config.ssid
    wifiAPI.resetInterfaceConfig(iface).then(
      wifiAPI
        .config(iface)
        .then((conf) => {
          conf.ssid = prevSSID
          pushConfig(conf) //this will call setConfig
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
    let updateChannelInfo = (params) => {
      let data = { ...params, ...wifiParameters }

      if (wifiParameters.Mode == 'b' || wifiParameters.Mode == 'g') {
        //empty out VHT capabilities for b/g mode
        data.Vht_capab = ''
      } else if (
        wifiParameters.Mode == 'a' &&
        (config.vht_capab == undefined || config.vht_capab == '')
      ) {
        //re-enable vht capabilities for 5GHz
        let tempConfig = generateConfigForBand(iwMap, iface, 2)
        data.Vht_capab = tempConfig.vht_capab
      }

      data.Hw_mode = data.Mode

      //data will have inherited Op_class from the channel calculation
      //the backend handles 6-e transition and relaxation.
      if (wifiParameters.Channel == 0) {
        //let the backend know to enable auto selection
        data.AutoSelectChannel = true
      }

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

    let is_6e_acs = wifiParameters.Channel == '6GHz'

    if (is_6e_acs) {
      //figure out how to set up class?
      //temp set chan to 1
      wifiParameters.Channel = 1
    } else {
      wifiParameters.Channel = parseInt(wifiParameters.Channel)
    }

    wifiAPI
      .calcChannel(wifiParameters)
      .then((r) => {
        if (is_6e_acs) {
          wifiParameters.Channel = 0
        }
        updateChannelInfo(r)
      })
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
      devsSelect.push({
        label,
        value: _iface,
        isDisabled: _iface.includes('.') || iwMap[_iface]?.spr_compat == false
      })

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
      size="sm"
      action="secondary"
      variant="outline"
      alignSelf="center"
      {...triggerProps}
    >
      <ButtonText>{`${iface} Options`}</ButtonText>
      <ButtonIcon as={WifiIcon} ml="$1" />
    </Button>
  )

  let curIface
  for (let i of interfaces) {
    if (i.Name == iface) {
      curIface = i
    }
  }

  return (
    <ScrollView pb="$20">
      <ListHeader title="Wifi Interface">
        <Button size="sm" action="secondary" onPress={restartWifi}>
          <ButtonText>Restart All Wifi Devices</ButtonText>
          <ButtonIcon as={RotateCwIcon} ml="$1" />
        </Button>
      </ListHeader>

      <Box
        bg="$backgroundCardLight"
        sx={{
          _dark: { bg: '$backgroundCardDark' }
        }}
        p="$4"
      >
        <FormControl flex={1} w="$2/3">
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

      <VStack space={4}>
        {iws.map((iw) => (
          <Box w="20%" key={iw.wiphy}>
            {iw.failsafeStatus !== 'ok' && (
              <Tooltip label="Reconfigure the interface under Radio Settings">
                <Badge action="warning" variant="outline">
                  <BadgeText>
                    ⚠️ {iwMap[iw.wiphy].dev} In Failsafe Mode
                  </BadgeText>
                </Badge>
              </Tooltip>
            )}
          </Box>
        ))}
      </VStack>

      {config.interface && interfaceEnabled === true ? (
        <WifiGuestNetworkParameters
          iface={iface}
          iws={iws}
          regs={regs}
          curInterface={curIface}
          setIface={setIface}
          config={config}
          onSubmit={updateChannels}
          updateExtraBSS={updateExtraBSS}
          deleteExtraBSS={deleteExtraBSS}
        />
      ) : null}

    </ScrollView>
  )
}

export default WifiGuestNetwork
