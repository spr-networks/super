import React, { useContext, useState, useEffect } from 'react'
import { View, StyleSheet } from 'react-native'

import { Box, Stack, VStack, useBreakpointValue } from 'native-base'

import { pluginAPI } from 'api'
import {
  WifiClients,
  Interfaces,
  WifiInfo
} from 'components/Dashboard/WifiWidgets'
import { TotalTraffic } from 'components/Dashboard/TrafficWidgets'
import {
  DNSMetrics,
  DNSBlockMetrics,
  DNSBlockPercent
} from 'components/Dashboard/DNSMetricsWidgets'

function Home() {
  const [pluginsEnabled, setPluginsEnabled] = useState([])

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
      <VStack flex="2" p="2">
        <Stack
          direction={{ base: 'column', md: 'row' }}
          justifyContent="stretch"
          space={4}
        >
          <WifiInfo />
          <WifiClients />
        </Stack>
        <VStack>
          <TotalTraffic />
          <Interfaces />
        </VStack>
      </VStack>
      <VStack flex="1" p="2">
        {pluginsEnabled.includes('dns-block') ? (
          <VStack>
            <DNSMetrics />
            <DNSBlockMetrics />
            <DNSBlockPercent />
          </VStack>
        ) : null}
      </VStack>
    </View>
  )
}

export default Home

/*
      <Box flex="auto" bg="#fff" alignItems="center" justifyContent="center">
      </Box>   
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 50,
    padding: 50
  }
})
*/
const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    padding: 10,
    marginTop: 90
  }
})
