import { useContext, useEffect, useState } from 'react'

import { wifiAPI, deviceAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import { prettySignal } from 'utils'

import {
  Box,
  FlatList,
  Stack,
  HStack,
  Text,
  useColorModeValue
} from 'native-base'

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
    const stations = await wifiAPI.allStations().catch((error) => {
      context.error('API Failure:' + error.message)
    })

    const devices = await deviceAPI.list().catch((error) => {
      context.error('API Failure getDevices: ' + error.message)
    })

    if (devices && stations) {
      let clients = Object.values(devices).filter((device) =>
        Object.keys(stations).includes(device.MAC)
      )

      clients = clients.map((client) => {
        let station = stations[client.MAC]
        client.Auth = akmSuiteAuth(station.AKMSuiteSelector)
        client.Signal = station.signal

        return client
      })

      setClients(clients)
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
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p="4"
    >
      <FlatList
        data={clients}
        renderItem={({ item }) => (
          <Box
            borderBottomWidth="1"
            _dark={{
              borderColor: 'muted.600'
            }}
            borderColor="muted.200"
            py="2"
          >
            <HStack space={2} justifyContent="space-between">
              <Text flex="1" bold alignSelf="center">
                {item.Name}
              </Text>

              <Stack
                flex="2"
                direction={{ base: 'column', md: 'row' }}
                space={2}
                alignItems="center"
              >
                <Text bold>{item.RecentIP}</Text>
                <Text color="muted.500">{item.MAC}</Text>
              </Stack>

              <Stack
                direction={{ base: 'column', md: 'row' }}
                space={2}
                alignSelf="center"
                marginLeft="auto"
                flex={1}
              >
                <HStack space={1} alignItems="center">
                  <Text color="muted.400">Signal</Text>
                  {prettySignal(item.Signal)}
                </HStack>
                <Text whiteSpace="nowrap">{item.Auth}</Text>
              </Stack>
            </HStack>
          </Box>
        )}
        keyExtractor={(item) => item.Name}
      />
    </Box>
  )
}

export default WifiClients
