import React, { Component, useEffect, useState } from 'react'
import { wifiAPI, meshAPI } from 'api'
import APIWifi from 'api/Wifi'
import StatsWidget from './StatsWidget'
import { AlertContext } from 'AppContext'

import { ClockIcon, Laptop2Icon, WifiIcon } from 'lucide-react-native'
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
import { InterfaceItem } from 'components/TagItem'

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
                          //alert(connectMACsList)
                          this.setState({
                            numberOfWifiClients: count + connectMACsList.length
                          })
                        })
                        .catch((err) => {})
                    }
                  })
                })
                .catch((err) => {})
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
        icon={Laptop2Icon}
        iconColor="$blueGray400"
        title="Active WiFi Clients"
        text={this.state.numberOfWifiClients}
        textFooter="Online"
        iconFooter={ClockIcon}
      />
    )
  }
}

export const WifiInfo = (props) => {
  const [ssid, setSsid] = useState('')
  const [channel, setChannel] = useState(0)

  const colorMode = useColorMode()

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
      icon={WifiIcon}
      iconColor={colorMode == 'light' ? '$info400' : '$info700'}
      title={title}
      text={ssid}
      textFooter={'Channel ' + channel}
      iconFooter={WifiIcon}
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

      ifaddrs.sort((a, b) => {
        if (a.ifname.startsWith('wlan')) {
          return -1000
        } else if (b.ifname.startsWith('wlan')) {
          return 1000
        }
        return a.ifname.indexOf(b.ifname)
      })

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
      p="$4"
    >
      <Heading size="md" fontWeight={300} textAlign="center">
        Interfaces
      </Heading>

      <Divider my="$2" />

      <HStack space="md" justifyContent="center" flexWrap="wrap">
        {addrs.map((address, index) => (
          <HStack key={`${address.local}.${index}`} space="md">
            <InterfaceItem
              size="sm"
              name={address.ifname}
              address={`${address.local}/${address.prefixlen}`}
            />
          </HStack>
        ))}
      </HStack>
    </Box>
  )
}

export const InterfacesFull = (props) => {
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
      p="$4"
    >
      <Heading size="md" fontWeight="300" textAlign="center">
        Interfaces
      </Heading>

      <Divider my="$4" />

      <Box px="$10">
        {addrs.map((address, index) => (
          <HStack key={`${address.local}.${index}`} space="md" pb="$2">
            <Text size="sm" flex={1} textAlign="right" bold>
              {address.ifname}
            </Text>
            <Text size="sm" flex={1}>
              {address.local}/{address.prefixlen}
            </Text>
          </HStack>
        ))}
      </Box>
    </Box>
  )
}
WifiClients.contextType = AlertContext

export default WifiClients
