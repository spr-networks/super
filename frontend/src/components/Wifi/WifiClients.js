import React, { useContext, useEffect, useState } from 'react'

import { wifiAPI, meshAPI, deviceAPI } from 'api'
import APIWifi from 'api/Wifi'
import { AppContext, AlertContext } from 'AppContext'

import { Box, FlatList, HStack, VStack, Text } from '@gluestack-ui/themed'

import { ListItem } from 'components/List'
import { InterfaceItem } from 'components/TagItem'
import DeviceItem from 'components/Devices/DeviceItem'
import { Tooltip } from 'components/Tooltip'
import WifiSignal from './WifiSignal'

const WifiClients = (props) => {
  const [clients, setClients] = useState([])
  const [spinner, setSpinner] = useState(true)
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)

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
    refreshAPI(wifiAPI)

    meshAPI
      .meshIter(() => new APIWifi())
      .then((r) => {
        r.forEach((remoteWifiApi) => {
          refreshAPI(remoteWifiApi)
        })
      })
      .catch((err) => {})
  }

  const refreshAPI = async (api) => {
    setSpinner(true)
    const ifaces = await api.interfacesApi
      .call(api, api, 'AP')
      .catch((error) => {
        context.error(
          'WIFI API Failure ' + (api.remoteURL ? api.remoteURL : '')
        )
        return
      })
    if (!ifaces) {
      return
    }
    let stations = {}

    for (let iface of ifaces) {
      let ret = await api.allStations.call(api, iface).catch((error) => {
        context.error('WIFI API Failure', error)
      })
      if (!ret) continue
      for (let mac of Object.keys(ret)) {
        ret[mac].Iface = iface
      }
      stations = { ...stations, ...ret }
    }

    const devices = await deviceAPI.list().catch((error) => {
      context.error('Device API Failure', error)
    })

    if (devices && stations) {
      let new_clients = Object.values(devices).filter((device) =>
        Object.keys(stations).includes(device.MAC)
      )

      new_clients = new_clients.map((client) => {
        let station = stations[client.MAC]
        client.Auth = akmSuiteAuth(station.AKMSuiteSelector)
        client.Signal = station.signal
        client.Iface = station.Iface
        client.TXRate = station.tx_rate_info
        client.RXRate = station.rx_rate_info
        client.VLanID = station.vlan_id
        client.Flags = station.flags
        client.AP = api.remoteURL.replace('http://', '').replace('/', '')
        return client
      })

      setClients((prevClients) => {
        let merged = {}
        let add_me = []
        let prev = prevClients || []
        for (let client of prev) {
          merged[client.MAC] = 1
        }
        for (let new_client of new_clients) {
          if (merged[new_client.MAC] != 1) {
            add_me.push(new_client)
          }
        }

        return add_me.concat(...prev)
      })
    }
    setSpinner(false)
  }

  const getWifiSpeedString = (txrate) => {
    if (!txrate) {
      return '802.11'
    }
    if (txrate.includes('[HE]')) {
      return '802.11ax'
    } else if (txrate.includes('[VHT]')) {
      return '802.11ac'
    } else if (txrate.includes('[HT]')) {
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
    <VStack>
      {/*spinner && <Spinner size="small" />*/}
      <FlatList
        data={clients}
        estimatedItemSize={100}
        renderItem={({ item }) => (
          <ListItem>
            <DeviceItem item={item} flex={1} justifyContent="space-between" />
            <Box
              sx={{
                '@base': { display: 'none' },
                '@md': { display: 'flex', flex: 0.5 }
              }}
              alignItems="center"
            >
              <InterfaceItem
                name={item.AP ? `${item.Iface}-${item.AP}` : item.Iface}
              />
            </Box>

            <VStack
              alignItems="flex-end"
              sx={{
                '@md': { flexDirection: 'row', gap: '$4', alignItems: 'center' }
              }}
            >
              <HStack space="sm" alignItems="center">
                {/*<Text color="$muted400" size="sm">
                  Signal
                </Text>*/}
                <WifiSignal
                  signal={item.Signal}
                  label={`Signal strength/RSSI: ${item.Signal}`}
                />
                <WifiSignal signal={item.Signal} onlyText />
              </HStack>

              <Tooltip
                label={`VLAN ${item.VLanID}: ${item.Flags}\nTX: ${item.TXRate} RX: ${item.RXRate}`}
              >
                <Text size="sm">{getWifiSpeedString(item.Flags)}</Text>
              </Tooltip>

              <Text flexWrap="nowrap" size="sm">
                {item.Auth}
              </Text>
            </VStack>
          </ListItem>
        )}
        keyExtractor={(item) => item.Name}
      />
    </VStack>
  )
}

export default WifiClients
