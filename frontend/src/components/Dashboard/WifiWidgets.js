import React, { Component, useEffect, useState } from 'react'
import { wifiAPI, meshAPI } from 'api'
import APIWifi from 'api/Wifi'
import StatsWidget from './StatsWidget'
import { faClock, faLaptop, faWifi } from '@fortawesome/free-solid-svg-icons'

import {
  Divider,
  Box,
  Heading,
  HStack,
  Icon,
  Text,
  VStack,
  useColorMode
} from '@gluestack-ui/themed'

export class WifiClientCount extends Component {
  state = { numberOfClients: 0 }

  componentDidMount() {
    wifiAPI
      .allStations(this.props.iface)
      .then((stations) => {
        let count = Object.keys(stations).length

        this.setState({ numberOfWifiClients: count })
        meshAPI
          .meshIter(() => new APIWifi())
          .then((r) => {
            let connectMACsList = [] // Declare an array to store the 'connectMACs' variables
            r.forEach((remoteWifiApi) => {
              remoteWifiApi.interfacesConfiguration
                .call(remoteWifiApi)
                .then((config) => {
                  config.forEach((iface) => {
                    if (iface.Type == 'AP' && iface.Enabled == true) {
                      remoteWifiApi.allStations
                        .call(remoteWifiApi, iface.Name)
                        .then((stations) => {
                          let connectedMACs = Object.keys(stations)
                          connectMACsList.push(...connectedMACs) // Push the 'connectedMACs' variable to the 'connectMACsList' array
                        })
                        .catch((err) => {})
                    }
                  })
                })
            })

            this.setState({
              numberOfWifiClients: count + connectMACsList.length
            })
          })
          .catch((err) => {})
      })
      .catch((err) => {})
  }

  render() {
    return <>{this.state.numberOfWifiClients}</>
  }
}

export class WifiClients extends WifiClientCount {
  render() {
    return (
      <StatsWidget
        {...this.props}
        icon={faLaptop}
        iconColor="$blueGray400"
        title="Active WiFi Clients"
        text={this.state.numberOfWifiClients}
        textFooter="Online"
        iconFooter={faClock}
      />
    )
  }
}

export const WifiInfo = (props) => {
  const [ssid, setSsid] = useState('')
  const [channel, setChannel] = useState(0)

  useEffect(() => {
    wifiAPI
      .status(props.iface)
      .then((status) => {
        setSsid(status['ssid[0]'])
        setChannel(status['channel'])
      })
      .catch((err) => {})
  }, [])

  let title = 'AP ' + props.iface
  return (
    <StatsWidget
      {...props}
      icon={faWifi}
      iconColor="$info400"
      title={title}
      text={ssid}
      textFooter={'Channel ' + channel}
      iconFooter={faWifi}
    />
  )
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
      bg={
        useColorMode() == 'light'
          ? '$backgroundCardLight'
          : '$backgroundCardDark'
      }
      borderRadius={10}
      mb={0}
      p={'$4'}
      shadow={'$4'}
    >
      <Heading size="md" fontWeight="300" textAlign="center">
        Interfaces
      </Heading>

      <Divider
        bg={useColorMode() == 'light' ? '$muted200' : '$muted.600'}
        my="$4"
      />

      <Box px="$10">
        {addrs.map((address, index) => (
          <HStack key={`${address.local}.${index}`} space="md" pb="$2">
            <Text size="sm" flex="1" textAlign="right" bold>
              {address.ifname}
            </Text>
            <Text flex="1">
              {address.local}/{address.prefixlen}
            </Text>
          </HStack>
        ))}
      </Box>
    </Box>
  )
}

export default WifiClients
