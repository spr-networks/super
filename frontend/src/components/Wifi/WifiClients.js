import React, { useContext, useEffect, useState } from 'react'

import { wifiAPI, deviceAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import { prettySignal } from 'utils'

import { Box, Stack, HStack, Text, Tooltip, useColorModeValue } from 'native-base'

import { FlashList } from '@shopify/flash-list'

const WifiClients = (props) => {
  const [clients, setClients] = useState([])
  const context = useContext(AlertContext)

  const akmSuiteAuth = (suite) => {
    const suites = {
      '00-0f-ac-1': '802.1x',
      '00-0f-ac-2': 'WPA-PSK',
      '00-0f-ac-3': 'FT-802.1x',
      '00-0f-ac-4': 'WPA-PSK-FT',
      '00-0f-ac-5': '802.1x-SHA256',
      '00-0f-ac-6': 'WPA-PSK-SHA256',
      '00-0f-ac-7': 'TDLS',
      '00-0f-ac-8': 'WPA3-SAE',
      '00-0f-ac-9': 'FT-SAE',
      '00-0f-ac-10': 'AP-PEER-KEY',
      '00-0f-ac-11': '802.1x-suite-B',
      '00-0f-ac-12': '802.1x-suite-B-192',
      '00-0f-ac-13': 'FT-802.1x-SHA384',
      '00-0f-ac-14': 'FILS-SHA256',
      '00-0f-ac-15': 'FILS-SHA384',
      '00-0f-ac-16': 'FT-FILS-SHA256',
      '00-0f-ac-17': 'FT-FILS-SHA384',
      '00-0f-ac-18': 'OWE',
      '00-0f-ac-19': 'FT-WPA2-PSK-SHA384',
      '00-0f-ac-20': 'WPA2-PSK-SHA384'
    }

    return suites[suite] || 'unknown'
  }

  const refreshClients = async () => {
    const ifaces = await wifiAPI.interfaces('AP').catch((error) => {
      context.error('WIFI API Failure', error)
    })

    let stations = {}
    for (let iface of ifaces) {
      let ret = await wifiAPI.allStations(iface).catch((error) => {
        context.error('WIFI API Failure', error)
      })

      for (let mac of Object.keys(ret)) {
        ret[mac].Iface = iface
      }
      stations = { ...stations, ...ret }
    }

    const devices = await deviceAPI.list().catch((error) => {
      context.error('Device API Failure', error)
    })

    if (devices && stations) {
      let clients = Object.values(devices).filter((device) =>
        Object.keys(stations).includes(device.MAC)
      )

      clients = clients.map((client) => {
        let station = stations[client.MAC]
        client.Auth = akmSuiteAuth(station.AKMSuiteSelector)
        client.Signal = station.signal
        client.Iface = station.Iface
        client.TXRate = station.tx_rate_info
        return client
      })
      setClients(clients)
    }
  }

  const getWifiSpeedString = (txrate) => {
    if (txrate.includes(' he')) {
      return '802.11ax'
    } else if (txrate.includes( 'vht')) {
      return '802.11ac'
    } else if (txrate.includes( 'ht')) {
      return '802.11n'
    } else {
      return '802.11a/b/g'
    }
  }

  useEffect(() => {
    refreshClients()

    const interval = setInterval(() => {
      if (clients.length) {
        refreshClients()
      }
    }, 10 * 1e3)

    return () => clearInterval(interval)
  }, [])

  return (
    <FlashList
      data={clients}
      estimatedItemSize={100}
      renderItem={({ item }) => (
        <Box
          bg="backgroundCardLight"
          borderBottomWidth={1}
          _dark={{
            bg: 'backgroundCardDark',
            borderColor: 'borderColorCardDark'
          }}
          borderColor="borderColorCardLight"
          p={4}
        >
          <HStack space={2} justifyContent="space-between">
            <Text flex="1" bold alignSelf="center">
              {item.Name}
            </Text>

            <Stack
              flex="1"
              display={{ base: 'none', md: 'block' }}
              direction={{ base: 'column', md: 'row' }}
              space={1}
              alignItems="center"
            >
              <Text>{item.Iface}</Text>
            </Stack>

            <Stack
              flex="2"
              direction={{ base: 'column', md: 'row' }}
              space={2}
              justifyContent="center"
            >
              <Text bold>{item.RecentIP}</Text>
              <Text color="muted.500">{item.MAC}</Text>
            </Stack>

            <Stack
              direction={{ base: 'column', md: 'row' }}
              space={2}
              alignSelf="center"
              marginLeft="auto"
              flex={2}
            >
              <HStack space={1} alignItems="center">
                <Tooltip label={item.TXRate}>
                  <Text>{getWifiSpeedString(item.TXRate)}</Text>
                </Tooltip>
              </HStack>
              <HStack space={1} alignItems="center">
                <Text color="muted.400">Signal</Text>
                {prettySignal(item.Signal)}
              </HStack>
              <Text flexWrap="nowrap">{item.Auth}</Text>
            </Stack>
          </HStack>
        </Box>
      )}
      keyExtractor={(item) => item.Name}
    />
  )
}

export default WifiClients
