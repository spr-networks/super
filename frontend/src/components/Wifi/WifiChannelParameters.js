import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { AlertContext } from 'AppContext'

import {
  Button,
  ButtonIcon,
  ButtonText,
  Checkbox,
  CheckboxGroup,
  CheckboxIcon,
  CheckboxIndicator,
  CheckboxLabel,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  Heading,
  Input,
  HStack,
  VStack,
  Text,
  InputField,
  CheckIcon
} from '@gluestack-ui/themed'

import { Select } from 'components/Select'

let modes = [
  { label: '5 & 6 GHz', value: 'a' },
  { label: '2.4 GHz', value: 'g' }
]

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
  const [bandwidthLabel, setBandwidthLabel] = useState('')
  const [mode, setMode] = useState(config.hw_mode) //('a')
  const [modeLabel, setModeLabel] = useState('5/6 GHz')
  const [errors, setErrors] = useState({})
  const [disable160, setDisable160] = useState(true)
  const [disableWifi6, setDisableWifi6] = useState(true)
  const [groupValues, setGroupValues] = React.useState([])

  //support for additional bssid
  const [disableExtraBSS, setDisableExtraBSS] = useState(true)
  const [extraSSID, setExtraSSID] = useState('-extra')

  const [selectedMode, setSelectedMode] = useState(modes[0])

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

  const [bandwidths, setBandwidths] = useState(bandwidth5)

  const handleModeChange = (newMode) => {
    let x = modes.find((v) => v.value == newMode)?.label
    setModeLabel(x)
  }

  useEffect(() => {
    //work around for selectedLabel not working
    //instead we use the labels as the value
    //but then we hook updating the mode.
    let x = modes.find((v) => v.label == modeLabel)?.value
    setMode(x)
    //update bandwidth
    if (x == 'a') {
      setBandwidth(80)
      handleBandwidthChange(bandwidth5, 80)
    } else {
      setBandwidth(40)
      handleBandwidthChange(bandwidth24, 40)
    }
  }, [modeLabel])

  //workarounds for selectedLabel again
  const handleBandwidthChange = (bands, newBandwidth) => {
    let x = bands.find((v) => v.value == newBandwidth)?.label
    setBandwidths(bands)
    setBandwidthLabel(x)
  }

  useEffect(() => {
    let x = mode == 'a' ? bandwidth5 : bandwidth24
    setBandwidths(x)
  }, [mode])

  useEffect(() => {
    let x = bandwidths.find((v) => v.label == bandwidthLabel)?.value
    setBandwidth(x)
  }, [bandwidthLabel])

  useEffect(() => {
    //props.config.interface should match TBD

    // switch to config-based settings
    setMode(config.hw_mode)
    handleModeChange(config.hw_mode)
    setSelectedMode(modes.find((v) => v.value == config.hw_mode))
    setChannel(config.channel)
    setExtraSSID(config.ssid + '-extra')

    let newBandwidth = 40
    if (config.vht_oper_chwidth == 0) {
      newBandwidth = 40
    } else if (config.vht_oper_chwidth == 1) {
      newBandwidth = 80
    } else if (config.vht_oper_chwidth == 2) {
      newBandwidth = 160
    } else if (config.vht_oper_chwidth == 3) {
      setBandwidth(8080)
      newBandwidth = 8080
    } else {
      // no vht. fall through
      if (config.ht_capab && config.ht_capab.includes('HT40')) {
        newBandwidth = 40
      } else {
        newBandwidth = 20
      }
    }

    setBandwidth(newBandwidth)
    handleBandwidthChange(
      config.hw_mode == 'a' ? bandwidth5 : bandwidth24,
      newBandwidth
    )

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
              if (capability.includes('160 MHz') || capability.includes('160Mhz')) {
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
          let ap_entry = combo.split('#').filter((e) => e.includes('AP'))
          if (ap_entry[0] && ap_entry[0].includes('<=')) {
            let num_supported = parseInt(ap_entry[0].split('<=')[1])
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
        let updatedByte = parseInt(base.substr(0, 2), 16) | 2
        const updatedByteHex = updatedByte
          .toString(16)
          .padStart(2, '0')
          .toUpperCase()
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
        Ssid: extraSSID,
        Bssid: bssid,
        Wpa: '1'
      })
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

  let checkboxProps = disableWifi6 ? { isDisabled: true } : {}
  let wpa1CheckboxProps = disableExtraBSS ? { isDisabled: true } : {}

  return (
    <>
      <HStack justifyContent="space-between" p="$4">
        <Heading size="sm">Channel Selection</Heading>
      </HStack>

      <VStack
        space="md"
        bg="$backgroundCardLight"
        sx={{ _dark: { bg: '$backgroundCardDark' } }}
        p="$4"
        pb="$8"
      >
        <Text pb="$4" color="$muted500" flexWrap="wrap">
          Use the Channel Selection to make sure the correct Frequency,
          Bandwidth &amp; Channel is set. This will update your HostAP config.
        </Text>

        <VStack
          sx={{ '@md': { flexDirection: 'row', alignItems: 'center' } }}
          space="md"
        >
          <FormControl flex={1}>
            <FormControlLabel>
              <FormControlLabelText>Frequency Band</FormControlLabelText>
            </FormControlLabel>
            {/*
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
              */}
            <Select
              selectedValue={modeLabel}
              initialLabel={modeLabel}
              onValueChange={(value) => {
                setModeLabel(value)
              }}
            >
              {modes.map((item) => (
                <Select.Item
                  key={item.label}
                  label={item.label}
                  value={item.label}
                  isDisabled={item.disabled}
                />
              ))}
            </Select>
          </FormControl>

          <FormControl flex={1} isInvalid={'bandwidth' in errors}>
            <FormControlLabel>
              <FormControlLabelText>Bandwidth</FormControlLabelText>
            </FormControlLabel>
            <Select
              selectedValue={bandwidthLabel}
              onValueChange={(value) => {
                setBandwidthLabel(value)
              }}
            >
              <Select.Item label="" value={0} />
              {bandwidths.map((item) => (
                <Select.Item
                  key={item.label}
                  label={item.label}
                  value={item.label}
                  isDisabled={item.disabled}
                />
              ))}
            </Select>
            {'bandwidth' in errors ? (
              <FormControlErrorMessage>
                <FormControlErrorMessageText>
                  Invalid Bandwidth
                </FormControlErrorMessageText>
              </FormControlErrorMessage>
            ) : null}
          </FormControl>

          <FormControl flex={1} isInvalid={'channel' in errors}>
            <FormControlLabel for="Channel">
              <FormControlLabelText>Channel</FormControlLabelText>
            </FormControlLabel>
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
              <FormControlErrorMessage>
                <FormControlErrorMessageText>
                  Invalid Channel
                </FormControlErrorMessageText>
              </FormControlErrorMessage>
            ) : null}
          </FormControl>

          <Button
            size="md"
            action="primary"
            sx={{
              '@base': { w: '$2/3', alignSelf: 'center' },
              '@md': { w: 120, alignSelf: 'flex-end' }
            }}
            onPress={handleSubmit}
          >
            <ButtonText>Save</ButtonText>
            <ButtonIcon as={CheckIcon} ml="$1" />
          </Button>
        </VStack>

        <CheckboxGroup
          value={groupValues}
          accessibilityLabel="WiFi Settings"
          onChange={setGroupValues}
        >
          <HStack space="md">
            <Checkbox {...checkboxProps} value={'wifi6'}>
              <CheckboxIndicator mr="$2">
                <CheckboxIcon />
              </CheckboxIndicator>
              <CheckboxLabel>Wifi 6 (AX)</CheckboxLabel>
            </Checkbox>

            <Checkbox {...checkboxProps} value={'extrabss'}>
              <CheckboxIndicator mr="$2">
                <CheckboxIcon />
              </CheckboxIndicator>
              <CheckboxLabel>Enable WPA1 SSID</CheckboxLabel>
            </Checkbox>
          </HStack>
        </CheckboxGroup>

        {groupValues.includes('extrabss') ? (
          <HStack>
            <Text flex={1}> Extra BSS Name</Text>
            <Input flex={2} size="md" variant="underlined">
              <InputField
                type="text"
                value={extraSSID}
                onChangeText={(value) => setExtraSSID(value)}
              />
            </Input>
          </HStack>
        ) : null}
      </VStack>
    </>
  )
}

WifiChannelParameters.propTypes = {
  notifyChange: PropTypes.func
}

export default WifiChannelParameters
