import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { AlertContext } from 'AppContext'

import {
  Box,
  Button,
  Checkbox,
  FormControl,
  Heading,
  Input,
  HStack,
  VStack,
  Stack,
  Select,
  Text
} from 'native-base'

const WifiChannelParameters = ({
  iface,
  setIface,
  config,
  iws,
  curInterface,
  onSubmit,
  updateExtraBSS,
  deleteExtraBSS,
  ...props
}) => {
  const context = useContext(AlertContext)
  const [channel, setChannel] = useState(0)
  const [bandwidth, setBandwidth] = useState(0)
  const [mode, setMode] = useState('a')
  const [errors, setErrors] = useState({})
  const [disable160, setDisable160] = useState(true)
  const [disableWifi6, setDisableWifi6] = useState(true)
  const [groupValues, setGroupValues] = React.useState([]);

  //support for additional bssid
  const [disableExtraBSS, setDisableExtraBSS] = useState(true)
  const [extraSSID, setExtraSSID] = useState("-extra")

  let bandwidth5 = [
    { label: '20 MHz', value: 20 },
    { label: '40 MHz', value: 40 },
    { label: '80 MHz', value: 80 },
    { label: '160 MHz', disabled: disable160, value: 160 },
    { label: '80+80 MHz', disabled: true, value: 8080 }
  ]

  const bandwidth24 = [
    { label: '20 MHz', value: 20 },
    { label: '40 MHz', value: 40 }
  ]

  let modes = [
    { label: '5 GHz', value: 'a' },
    { label: '2.4 GHz', value: 'g' }
  ]

  useEffect(() => {
    //props.config.interface should match TBD

    // switch to config-based settings
    setMode(config.hw_mode)
    setChannel(config.channel)
    setExtraSSID(config.ssid + "-extra")

    if (config.vht_oper_chwidth == 0) {
      setBandwidth(40)
    } else if (config.vht_oper_chwidth == 1) {
      setBandwidth(80)
    } else if (config.vht_oper_chwidth == 2) {
      setBandwidth(160)
    } else if (config.vht_oper_chwidth == 3) {
      setBandwidth(8080)
    } else {
      // no vht. fall through
      if (config.ht_capab && config.ht_capab.includes('HT40')) {
        setBandwidth(40)
      } else {
        setBandwidth(20)
      }
    }

    if (config.ieee80211ax == 1) {
      setGroupValues(['wifi6'])
      if (!groupValues.includes('wifi6')) {
        setGroupValues(groupValues.concat('wifi6'))
      }
    }

    if (curInterface) {
      if (curInterface.ExtraBSS && curInterface.ExtraBSS.length == 1) {
        let extra = curInterface.ExtraBSS[0]
        setExtraSSID(extra.Ssid)
        if (!groupValues.includes('extrabss')) {
          setGroupValues(groupValues.concat('extrabss'))
        }
      }
    }

    //set bw and channels
    for (let iw of iws) {
      if (iw.devices[iface]) {
        let cur_device = iw.devices[iface]
        if (!cur_device) continue

        //enable 160 MHz if supported by the card
        for (let band of iw.bands) {
          if (band.vht_capabilities) {
            for (let capability of band.vht_capabilities) {
              if (capability.includes('160 MHz')) {
                setDisable160(false)
              }
            }
          }
          if (band.he_phy_capabilities) {
            setDisableWifi6(false)
          }
        }

        //check if valid_interface_combinations supports multiple APs
        let combos = iw.valid_interface_combinations
        for (let combo of combos) {
          let ap_entry = combo.split("#").filter((e) => e.includes('AP'))
          if (ap_entry[0] && ap_entry[0].includes('<=')) {
            let num_supported = parseInt(ap_entry[0].split("<=")[1])
            if (num_supported > 0) {
              setDisableExtraBSS(false)
            }
          }
        }

        //in the future, iw needs to be polled
        // to parse this correctly
        // along with an explanation about restarts
        //get bandwidth and channel
        /*
        if (cur_device.channel) {
          let parts = cur_device.channel.split(',')

          let start_freq = parts[0].split(' ')[1].substring(1)[0]
          if (start_freq == '2') {
            setMode('g')
          } else if (start_freq == '5') {
            setMode('a')
          }

          let channel = parseInt(parts[0].split(' ')[0])
          let bandwidth = parseInt(parts[1].split(' ')[2])

        }
          */
      }
    }
  }, [iface, config, iws, curInterface])

  const enumerateChannelOptions = () => {
    //const iface = props.config.interface
    let validChannels = []

    let expectedFreq = mode == 'a' ? '5' : '2'
    for (let iw of iws) {
      if (!iw.devices[iface]) {
        continue
      }

      for (let band of iw.bands) {
        //if the band does not match the current mode, skip it
        if (!band.frequencies || band.frequencies[0][0] != expectedFreq) {
          continue
        }

        for (let freq of band.frequencies) {
          let channelNumber = parseInt(freq.split(' ')[2].slice(1, -1))
          let channelLabel = channelNumber
          let isDisabled = false
          if (freq.includes('disabled')) {
            isDisabled = true
            channelLabel += ' disabled'
          } else if (freq.includes('no IR')) {
            isDisabled = true
            channelLabel += ' No Initial Radiation (No-IR)'
          } else if (freq.includes('radar')) {
            channelLabel += ' DFS'
            if (config.ieee80211h !== 1) {
              isDisabled = true
            }
          }

          validChannels.push({
            value: channelNumber,
            label: channelLabel,
            toolTip: freq,
            disabled: isDisabled
          })
        }
      }
    }

    return validChannels
  }

  const isValid = () => {
    if (!bandwidth) {
      setErrors({ bandwidth: true })
      return false
    }

    if (!channel) {
      setErrors({ channel: true })
      return false
    }

    return true
  }

  const getLLAIfaceAddr = (iface) => {
    for (let iw of iws) {
      if (iw.devices[iface]) {
        let base = iw.devices[iface].addr
        let updatedByte = parseInt(base.substr(0,2),16) | 2
        const updatedByteHex = updatedByte.toString(16).padStart(2, '0').toUpperCase();
        return updatedByteHex + base.substr(2)
      }
    }
    return null
  }

  const handleSubmit = () => {
    if (!isValid()) {
      return
    }

    if (groupValues.includes('extrabss')) {
      //right now support exists for an additional AP running WPA1
      // for backwards compatibility with older devices.
      //configure it.

      //API will take care of mediatek convention, where LLA  bit is cleared
      // for main but set for extra
      let bssid = getLLAIfaceAddr(iface)
      updateExtraBSS(iface, {
        'Ssid': extraSSID,
        'Bssid': bssid,
        'Wpa': "1"
      });
    } else {
      //if interfaces had an extra bss then clear it out
      if (curInterface.ExtraBSS && curInterface.ExtraBSS.length > 0) {
        deleteExtraBSS(iface)
      }
    }

    let wifiParameters = {
      //Interface: iface,
      Channel: channel,
      Mode: mode,
      Bandwidth: bandwidth,
      HT_Enable: true,
      VHT_Enable: mode == 'a' ? true : false,
      HE_Enable: true
    }

    if (groupValues.includes('wifi6')) {
      wifiParameters.He_mu_beamformer = 1
      wifiParameters.He_su_beamformee = 1
      wifiParameters.He_su_beamformer = 1
      wifiParameters.Ieee80211ax = 1
    } else {
      wifiParameters.He_mu_beamformer = 0
      wifiParameters.He_su_beamformee = 0
      wifiParameters.He_su_beamformer = 0
      wifiParameters.Ieee80211ax = 0
    }



    onSubmit(wifiParameters)
  }

  let bandwidths = mode == 'a' ? bandwidth5 : bandwidth24

  let checkboxProps = disableWifi6 ? { isDisabled: true } : {}
  let wpa1CheckboxProps = disableExtraBSS ? { isDisabled: true} : {}

  return (
    <>
      <HStack justifyContent="space-between" p={4}>
        <Heading fontSize="md">Channel Selection</Heading>
      </HStack>

      <VStack
        space={2}
        _light={{ bg: 'backgroundCardLight' }}
        _dark={{ bg: 'backgroundCardDark' }}
        p={4}
        pb={8}
      >
        <Text pb={4} color="muted.500">
          Use the Channel Selection to make sure the correct Frequency,
          Bandwidth &amp; Channel is set. This will update your HostAP config.
        </Text>

        <Stack
          direction={{ base: 'column', md: 'row' }}
          space={2}
          alignItems="center"
        >
          <FormControl flex={1}>
            <FormControl.Label>Frequency Band</FormControl.Label>
            <Select
              selectedValue={mode}
              onValueChange={(value) => setMode(value)}
            >
              {modes.map((item) => (
                <Select.Item
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  isDisabled={item.disabled}
                />
              ))}
            </Select>
          </FormControl>

          <FormControl flex={1} isInvalid={'bandwidth' in errors}>
            <FormControl.Label>Bandwidth</FormControl.Label>
            <Select
              selectedValue={bandwidth}
              onValueChange={(value) => {
                setBandwidth(parseInt(value))
              }}
            >
              <Select.Item label="" value={0} />
              {bandwidths.map((item) => (
                <Select.Item
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  isDisabled={item.disabled}
                />
              ))}
            </Select>
            {'bandwidth' in errors ? (
              <FormControl.ErrorMessage
                _text={{
                  fontSize: 'xs'
                }}
              >
                Invalid Bandwidth
              </FormControl.ErrorMessage>
            ) : null}
          </FormControl>

          <FormControl flex={1} isInvalid={'channel' in errors}>
            <FormControl.Label for="Channel">Channel</FormControl.Label>
            <Select
              selectedValue={channel}
              onValueChange={(value) => setChannel(parseInt(value))}
            >
              <Select.Item label="" value={0} />
              {enumerateChannelOptions().map((item) => (
                <Select.Item
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  isDisabled={item.disabled}
                />
              ))}
            </Select>
            {'channel' in errors ? (
              <FormControl.ErrorMessage
                _text={{
                  fontSize: 'xs'
                }}
              >
                Invalid Channel
              </FormControl.ErrorMessage>
            ) : null}
          </FormControl>

          <Button
            __flex={{ base: 1, md: 1 }}
            w={{ base: '2/3', md: '1/6' }}
            mt={4}
            colorScheme="primary"
            size="sm"
            type="submit"
            alignSelf={{ base: 'center', md: 'flex-end' }}
            onPress={handleSubmit}
          >
            Save
          </Button>
        </Stack>
        <HStack>
            <Checkbox.Group onChange={setGroupValues} value={groupValues} accessibilityLabel="wifi settings">
              <Checkbox {...checkboxProps} value="wifi6">Wifi 6 (AX) </Checkbox>
              <Checkbox {...wpa1CheckboxProps} value="extrabss"> Enable WPA1 SSID </Checkbox>
            </Checkbox.Group>
        </HStack>
        {groupValues.includes('extrabss') ? (
          <HStack>
          <Text flex={1}> Extra BSS Name </Text>
          <Input
            size="lg"
            type="text"
            variant="underlined"
            flex={2}
            value={extraSSID}
            onChangeText={(value) => setExtraSSID(value)}
          />
          </HStack>
        ) : null }
      </VStack>
    </>
  )
}

WifiChannelParameters.propTypes = {
  notifyChange: PropTypes.func
}

export default WifiChannelParameters
