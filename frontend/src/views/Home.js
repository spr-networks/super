import React, { useContext, useState, useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import { Box, Stack, HStack, VStack, useBreakpointValue } from 'native-base'
import { AppContext } from 'AppContext'
import { pluginAPI, pfwAPI, wifiAPI, api } from 'api'

import {
  WifiClients,
  Interfaces,
  WifiInfo
} from 'components/Dashboard/WifiWidgets'
import {
  WireguardPeers,
  WireguardPeersActive
} from 'components/Dashboard/WireguardWidgets'
import { TotalTraffic } from 'components/Dashboard/TrafficWidgets'
import {
  DNSMetrics,
  DNSBlockMetrics,
  DNSBlockPercent
} from 'components/Dashboard/DNSMetricsWidgets'

const Home = (props) => {
  const [pluginsEnabled, setPluginsEnabled] = useState([])
  const context = useContext(AppContext)

  useEffect(() => {
    pluginAPI
      .list()
      .then((plugins) =>
        setPluginsEnabled(plugins.filter((p) => p.Enabled).map((p) => p.Name))
      )
      .catch((error) => error)
  }, [])

  const flexDirection = useBreakpointValue({
    base: 'column',
    lg: 'row'
  })

  return (
    <View style={{ flexDirection }}>
      <VStack flex={{ base: 'none', md: 2 }} p={2}>
        <Stack
          direction={{ base: 'column', md: 'row' }}
          justifyContent="space-between"
          space={4}
        >
          {context.isWifiDisabled ? (
            <>
              <WireguardPeers flex={1} />
              <WireguardPeersActive flex={1} />
            </>
          ) : (
            <>
              <WifiInfo flex={1} />
              <WifiClients flex={1} />
            </>
          )}
        </Stack>

        <VStack>
          <TotalTraffic />
          <Interfaces />
        </VStack>
      </VStack>
      <VStack flex={1} p={2}>
        {pluginsEnabled.includes('dns-block') ? (
          <VStack>
            <DNSMetrics />
            <DNSBlockMetrics />
            <DNSBlockPercent />
          </VStack>
        ) : null}
        {context.isWifiDisabled ? null : <WireguardPeersActive />}
      </VStack>
    </View>
  )
}

export default Home
