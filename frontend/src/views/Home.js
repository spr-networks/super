import React, { useContext, useState, useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import { Box, Stack, VStack, useBreakpointValue } from 'native-base'
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


    api
      .features()
      .then((res) => {
        if (res.includes("wifi")) {
          context.setIsWifiDisabled(false)
        } else {
          context.setIsWifiDisabled(true)
        }
      })
      .catch((err) => {
        context.setIsWifiDisabled(true)
      })

    pfwAPI.config().then((res) => {
      context.setIsPlusDisabled(false)
    }).catch((err) => {
      context.setIsPlusDisabled(true)
    })

  }, [])

  const flexDirection = useBreakpointValue({
    base: 'column',
    lg: 'row'
  })

  return (
    <View style={{ flexDirection }}>
      <VStack flex={2} p={2}>
        <Stack
          direction={{ base: 'column', md: 'row' }}
          justifyContent="stretch"
          space={4}
        >
          {context.isWifiDisabled ? (
            <>
              <WireguardPeers />
              <WireguardPeersActive />
            </>
          ) : (
            <>
              <WifiInfo />
              <WifiClients />
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
