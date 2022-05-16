import React, { Component, useEffect, useState } from 'react'
import { wifiAPI } from 'api/Wifi'
import StatsWidget from './StatsWidget'
import { faClock, faLaptop, faWifi } from '@fortawesome/free-solid-svg-icons'

import { Divider, Box, Stack, Icon, Text, useColorModeValue } from 'native-base'

export class WifiClientCount extends Component {
  state = { numberOfClients: 0 }

  async componentDidMount() {
    const stations = await wifiAPI.allStations()
    this.setState({ numberOfWifiClients: Object.keys(stations).length })
  }

  render() {
    return <>{this.state.numberOfWifiClients}</>
  }
}

export class WifiClients extends WifiClientCount {
  render() {
    return (
      <StatsWidget
        icon={faLaptop}
        iconColor="blueGray.400"
        title="Active WiFi Clients"
        text={this.state.numberOfWifiClients}
        textFooter="Online"
        iconFooter={faClock}
      />
    )
  }
}

export class WifiInfo extends Component {
  state = { ssid: '', channel: 0 }

  async componentDidMount() {
    let status = await wifiAPI.status()
    this.setState({ ssid: status['ssid[0]'] })
    this.setState({ channel: status['channel'] })
  }

  render() {
    return (
      <StatsWidget
        icon={faWifi}
        iconColor="info.400"
        title="Wifi AP"
        text={this.state.ssid}
        textFooter={'Channel ' + this.state.channel}
        iconFooter={faWifi}
      />
    )
  }
}

export const Interfaces = (props) => {
  const [addrs, setAddrs] = useState([])

  useEffect(() => {
    wifiAPI.ipAddr().then((data) => {
      let ifaddrs = []
      for (let entry of data) {
        for (let address of entry.addr_info) {
          if (address.scope == 'global') {
            address.ifname = entry.ifname
            ifaddrs.push(address)
          }

          break
        }
      }

      setAddrs(ifaddrs)
    })
  }, [])

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      borderRadius="10"
      mb={4}
      p={5}
      shadow={4}
    >
      <Text fontSize="lg" textAlign="center">
        Interfaces
      </Text>

      <Divider _light={{ bg: 'muted.200' }} my="2" />

      <Box px="10">
        {addrs.map((address) => (
          <Stack key={address.local} direction="row" space="2" pb="2">
            <Text flex="1" textAlign="right" bold>
              {address.ifname}
            </Text>
            <Text flex="1">
              {address.local}/{address.prefixlen}
            </Text>
          </Stack>
        ))}
      </Box>
    </Box>
  )
}

export default WifiClients
