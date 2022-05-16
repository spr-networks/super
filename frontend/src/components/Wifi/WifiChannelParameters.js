import React from 'react'

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
  Select
} from 'native-base'

class WifiChannelParameters extends React.Component {
  Bandwidth5 = [
    { label: '20 MHz', value: 20 },
    { label: '40 MHz', value: 40 },
    { label: '80 MHz', value: 80 },
    { label: '160 MHz', disabled: true, value: 160 },
    { label: '80+80 MHz', disabled: true, value: 8080 }
  ]

  Bandwidth24 = [
    { label: '20 MHz', value: 20 },
    { label: '40 MHz', value: 40 }
  ]

  state = {
    Iface: '',
    Channel: 0,
    Bandwidth: 0,
    Mode: 'a',
    HT_Enable: true,
    VHT_Enable: true,
    HE_Enable: true,

    devs: [],
    iws: [],
    loadedDevs: false
  }

  constructor(props) {
    super(props)

    this.handleChangeSelect = this.handleChangeSelect.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChangeSelect(name, value) {
    if (name == 'Mode') {
      this.setState({ Bandwidth: 0, Channel: 0 })
    }

    if (['Bandwidth', 'Channel'].includes(value)) {
      value = parseInt(value)
    }

    this.setState({ [name]: value })
  }

  handleSubmit() {
    let wifiParameters = {
      //Interface: this.state.Iface,
      Channel: this.state.Channel,
      Mode: this.state.Mode,
      Bandwidth: this.state.Bandwidth,
      HT_Enable: this.state.HT_Enable,
      VHT_Enable: this.state.Mode == 'a' ? this.state.VHT_Enable : false,
      HE_Enable: this.state.HE_Enable
    }

    const done = (res) => {
      if (this.props.notifyChange) {
        this.props.notifyChange({ ...wifiParameters, ...res })
        this.context.success('Set Channel Parameters')
      }
    }

    wifiAPI.setChannel(wifiParameters).then(done, (e) => {
      this.context.error('API Failure: ' + e.message)
    })
  }

  enumerateChannelOptions() {
    let validChannels = []

    let expectedFreq = ''
    if (this.state.Mode == 'a') {
      expectedFreq = '5'
    } else if (this.state.Mode == 'g') {
      expectedFreq = '2'
    }

    for (let iw of this.state.iws) {
      if (iw.devices[this.props.config.interface]) {
        for (let band of iw.bands) {
          //if the band does not match the current mode, skip it
          if (band.frequencies && band.frequencies[0][0] == expectedFreq) {
            for (let freq of band.frequencies) {
              let channelNumber = freq.split(' ')[2].slice(1, -1)
              let channelLabel = channelNumber
              let is_disabled = false
              if (freq.includes('disabled')) {
                is_disabled = true
                channelLabel += ' disabled'
              } else if (freq.includes('no IR')) {
                is_disabled = true
                channelLabel += ' No Initial Radiation (No-IR)'
              } else if (freq.includes('radar')) {
                channelLabel += ' DFS'
                if (this.props.config.ieee80211h !== 1) {
                  is_disabled = true
                }
              }
              validChannels.push({
                value: channelNumber,
                label: channelLabel,
                toolTip: freq,
                disabled: is_disabled
              })
            }
          }
        }
      }
    }

    return validChannels
  }

  async componentDidMount() {
    wifiAPI.iwDev().then((devs) => {
      wifiAPI.iwList().then((iws) => {
        iws = iws.map((iw) => {
          iw.devices = devs[iw.wiphy]
          return iw
        })

        for (let iw of iws) {
          if (iw.devices[this.props.config.interface]) {
            let cur_device = iw.devices[this.props.config.interface]
            if (!cur_device) continue

            //Enable 160 MHz if supported by the card

            for (let band of iw.bands) {
              if (band.vht_capabilities) {
                for (let capability of band.vht_capabilities) {
                  if (capability.includes('160 MHz')) {
                    this.Bandwidth5[3].disabled = false
                  }
                }
              }
            }

            //get bandwidth and cahnnel
            if (cur_device.channel) {
              let parts = cur_device.channel.split(',')
              let channel = parseInt(parts[0].split(' ')[0])
              let bw = parseInt(parts[1].split(' ')[2])
              this.setState({ Bandwidth: bw, Channel: channel })

              let start_freq = parts[0].split(' ')[1].substring(1)[0]
              if (start_freq == '2') {
                this.setState({ Mode: 'g' })
              } else if (start_freq == '5') {
                this.setState({ Mode: 'a' })
              }
            }
          }
        }

        this.setState({ devs })
        this.setState({ iws })
        this.setState({ loadedDevs: true })
      })
    })
  }

  render() {
    let Modes = [
      { label: '5 GHz', value: 'a' },
      { label: '2.4 GHz', value: 'g' }
    ]

    let devsScan = []
    let defaultDev = null
    for (let phy in this.state.devs) {
      for (let iface in this.state.devs[phy]) {
        let type = this.state.devs[phy][iface].type
        let label = `${iface} ${type}`

        devsScan.push({ value: iface, disabled: !type.includes('AP'), label })
        if (iface == this.props.config.interface) {
          defaultDev = devsScan[devsScan.length - 1].value
        }
      }
    }

    let Bandwidths = this.state.Mode == 'a' ? this.Bandwidth5 : this.Bandwidth24

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
            <Heading sz="lg">Channel Selection</Heading>

            <HStack space={2}>
              <FormControl flex={1}>
                <FormControl.Label>WiFi Interface</FormControl.Label>
                {this.state.loadedDevs ? (
                  <Select
                    selectedValue={defaultDev}
                    onValueChange={(value) =>
                      this.handleChangeSelect('Iface', value)
                    }
                    accessibilityLabel="Wifi Interface"
                  >
                    {devsScan.map((dev) => (
                      <Select.Item label={dev.label} value={dev.value} />
                    ))}
                  </Select>
                ) : null}
              </FormControl>

              <FormControl flex={1}>
                <FormControl.Label>Frequency Band</FormControl.Label>
                <Select
                  selectedValue={this.state.Mode}
                  onValueChange={(value) =>
                    this.handleChangeSelect('Mode', value)
                  }
                >
                  {Modes.map((item) => (
                    <Select.Item
                      label={item.label}
                      value={item.value}
                      isDisabled={item.disabled}
                    />
                  ))}
                </Select>
              </FormControl>

              <FormControl flex={1}>
                <FormControl.Label>Bandwidth</FormControl.Label>
                <Select
                  selectedValue={this.state.Bandwidth}
                  onValueChange={(value) =>
                    this.handleChangeSelect('Bandwidth', value)
                  }
                >
                  {Bandwidths.map((item) => (
                    <Select.Item
                      label={item.label}
                      value={item.value}
                      isDisabled={item.disabled}
                    />
                  ))}
                </Select>
              </FormControl>

              <FormControl flex={1}>
                <FormControl.Label for="Channel">Channel</FormControl.Label>
                <Select
                  selectedValue={this.state.Channel}
                  onValueChange={(value) =>
                    this.handleChangeSelect('Channel', value)
                  }
                >
                  {this.enumerateChannelOptions().map((item) => (
                    <Select.Item
                      label={item.label}
                      value={item.value}
                      isDisabled={item.disabled}
                    />
                  ))}
                </Select>
              </FormControl>
            </HStack>

            <VStack space={2}>
              <Button
                colorScheme="primary"
                size="md"
                type="submit"
                onPress={this.handleSubmit}
              >
                Save
              </Button>
            </VStack>
          </VStack>
        </Box>
      </>
    )
  }
}

WifiChannelParameters.contextType = AlertContext

WifiChannelParameters.propTypes = {
  notifyChange: PropTypes.func
}

export default WifiChannelParameters
