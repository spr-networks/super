import React, { useContext, useEffect, useState } from 'react'
import PropTypes from 'prop-types'

import { AlertContext } from 'AppContext'
import { wifiAPI } from 'api'

import {
  Box,
  Button,
  FormControl,
  Heading,
  HStack,
  VStack,
  Stack,
  Select
} from 'native-base'

const WifiChannelParameters = (props) => {
  const context = useContext(AlertContext)

  const [iface, setIface] = useState('')
  const [channel, setChannel] = useState(0)
  const [bandwidth, setBandwidth] = useState(0)
  const [mode, setMode] = useState('a')
  const [devices, setDevices] = useState([])
  const [iws, setIws] = useState([])
  const [devicesLoaded, setDevicesLoaded] = useState(false)
  const [errors, setErrors] = useState({})

  const bandwidth5 = [
    { label: '20 MHz', value: 20 },
    { label: '40 MHz', value: 40 },
    { label: '80 MHz', value: 80 },
    { label: '160 MHz', disabled: true, value: 160 },
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
    let iface = props.config.interface
    setIface(props.config.interface)

    wifiAPI.iwDev().then((devs) => {
      setDevices(devs)

      wifiAPI.iwList().then((iws) => {
        iws = iws.map((iw) => {
          iw.devices = devs[iw.wiphy]
          return iw
        })

        setIws(iws)

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
                    let index160 = bandwidth5.findIndex(
                      (item) => item.label == '160 MHz'
                    )
                    bandwidth5[index160].disabled = false
                  }
                }
              }
            }

            //get bandwidth and channel
            if (cur_device.channel) {
              let parts = cur_device.channel.split(',')
              let channel = parseInt(parts[0].split(' ')[0])
              let bandwidth = parseInt(parts[1].split(' ')[2])

              setBandwidth(bandwidth)
              setChannel(channel)

              let start_freq = parts[0].split(' ')[1].substring(1)[0]
              if (start_freq == '2') {
                setMode('g')
              } else if (start_freq == '5') {
                setMode('a')
              }
            }
          }
        }

        setDevicesLoaded(true)
      })
    })
  }, [props.config])

  useEffect(() => {
    setBandwidth(0)
    setChannel(0)
  }, [mode])

  useEffect(() => {
    setErrors({})
  }, [bandwidth, channel])

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
            if (props.config.ieee80211h !== 1) {
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

    const done = (res) => {
      if (props.notifyChange) {
        props.notifyChange({ ...wifiParameters, ...res })
        context.success('Set Channel Parameters')
      }
    }

    wifiAPI
      .setChannel(wifiParameters)
      .then(done)
      .catch((e) => {
        context.error('API Failure: ' + e.message)
      })
  }

  let devsScan = []
  let selectedDevice = null

  for (let phy in devices) {
    for (let iface in devices[phy]) {
      let type = devices[phy][iface].type,
        label = `${iface} ${type}`

      //skip VLAN & managed entries
      if (type.includes('AP/VLAN') || type.includes('managed')) {
        continue
      }

      devsScan.push({ label, value: iface, disabled: !type.includes('AP') })

      if (iface == props.config.interface) {
        selectedDevice = devsScan[devsScan.length - 1].value
      }
    }
  }

  let bandwidths = mode == 'a' ? bandwidth5 : bandwidth24

  return (
    <>
      <Box
        _light={{ bg: 'warmGray.50' }}
        _dark={{ bg: 'blueGray.800' }}
        rounded="md"
        width="100%"
        p="4"
      >
        <VStack space={2}>
          <Heading fontSize="lg">Channel Selection</Heading>

          <Stack direction={{ base: 'column', md: 'row' }} space={2}>
            <FormControl flex={1}>
              <FormControl.Label>WiFi Interface</FormControl.Label>
              {devicesLoaded ? (
                <Select
                  selectedValue={selectedDevice}
                  onValueChange={(value) => setIface(value)}
                  accessibilityLabel="Wifi Interface"
                >
                  {devsScan.map((dev) => (
                    <Select.Item
                      key={dev.label}
                      label={dev.label}
                      value={dev.value}
                    />
                  ))}
                </Select>
              ) : null}
            </FormControl>

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
          </Stack>

          <Button
            colorScheme="primary"
            size="md"
            width="50%"
            alignSelf="center"
            type="submit"
            onPress={handleSubmit}
            mt={4}
          >
            Save
          </Button>
        </VStack>
      </Box>
    </>
  )
}

WifiChannelParameters.propTypes = {
  notifyChange: PropTypes.func
}

export default WifiChannelParameters
