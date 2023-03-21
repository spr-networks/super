import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { AlertContext } from 'AppContext'

import {
  Box,
  Button,
  FormControl,
  Heading,
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
  onSubmit,
  ...props
}) => {
  const context = useContext(AlertContext)
  const [channel, setChannel] = useState(0)
  const [bandwidth, setBandwidth] = useState(0)
  const [mode, setMode] = useState('a')
  const [errors, setErrors] = useState({})
  const [disable160, setDisable160] = useState(true)

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
      if (config.ht_capab && config.ht_capab.includes("HT40")) {
        setBandwidth(40)
      } else {
        setBandwidth(20)
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
  }, [iface, config, iws])

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

  const handleSubmit = () => {
    if (!isValid()) {
      return
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

    onSubmit(wifiParameters)
  }

  let bandwidths = mode == 'a' ? bandwidth5 : bandwidth24

  return (
    <>
      <HStack justifyContent="space-between" p={4}>
        <Heading fontSize="md">Channel Selection</Heading>
      </HStack>

      <VStack
        space={2}
        _light={{ bg: 'warmGray.50' }}
        _dark={{ bg: 'blueGray.800' }}
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
      </VStack>
    </>
  )
}

WifiChannelParameters.propTypes = {
  notifyChange: PropTypes.func
}

export default WifiChannelParameters
