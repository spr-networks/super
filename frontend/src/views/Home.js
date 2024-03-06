import React, { useContext, useState, useEffect, useRef } from 'react'
import { AppState, RefreshControl } from 'react-native'

import {
  Box,
  Text,
  VStack,
  ScrollView,
  HStack,
  Spinner
} from '@gluestack-ui/themed'
import { AppContext } from 'AppContext'
import { pluginAPI, wifiAPI } from 'api'

import {
  WifiClients,
  Interfaces,
  WifiInfo
} from 'components/Dashboard/WifiWidgets'
import {
  WireguardPeers,
  WireguardPeersActive
} from 'components/Dashboard/WireguardWidgets'

import {
  TotalTraffic,
  DeviceTraffic
} from 'components/Dashboard/TrafficWidgets'
import {
  DNSMetrics,
  DNSBlockMetrics,
  DNSBlockFullMetrics,
  DNSBlockPercent
} from 'components/Dashboard/DNSMetricsWidgets'
import { ServicesEnabled } from 'components/Dashboard/ServicesWidgets'

const Home = (props) => {
  const context = useContext(AppContext)

  const [pluginsEnabled, setPluginsEnabled] = useState([])
  const [interfaces, setInterfaces] = useState([])

  useEffect(() => {
    pluginAPI
      .list()
      .then((plugins) => {
        setPluginsEnabled(
          plugins
            .filter((p) => p.Enabled)
            .map((p) => p.Name.replace(/-extension/, ''))
        )
      })
      .catch((error) => error)
  }, [])

  const [refreshing, setRefreshing] = useState(false)
  const appState = useRef(AppState.currentState)

  const onRefresh = React.useCallback(() => {
    setRefreshing(true)
    setTimeout(() => {
      setRefreshing(false)
    }, 1)
  }, [])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        onRefresh()
      }

      appState.current = nextAppState
    })

    return () => {
      subscription.remove()
    }
  }, [])

  useEffect(() => {
    wifiAPI
      .interfaces('AP')
      .then((ifaces) => {
        setInterfaces(ifaces)
      })
      .catch((error) => error)
  }, [])

  let show = {
    dns: pluginsEnabled.includes('dns-block') && !context.isMeshNode,
    wifi: !context.isWifiDisabled,
    vpnInfo: context.isWifiDisabled && context.features.includes('wireguard'),
    vpnSide:
      !context.isWifiDisabled &&
      !context.isMeshNode &&
      pluginsEnabled.includes('wireguard'),
    traffic: !context.isMeshNode
  }

  //NOTE wireguard listed as feature when not enabled
  //features=dns,ppp,wifi,wireguard
  let services = [...pluginsEnabled]
  let featuresNoVPN = context.features.filter((f) => f != 'wireguard')
  services = [...services, ...featuresNoVPN]

  if (refreshing) {
    //return <Spinner mt="$16" size="large" />
    return <></>
  }

  return (
    <ScrollView
      sx={{ '@md': { h: '92vh' } }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Box
        flexDirection="row"
        sx={{
          '@base': { flexDirection: 'column' },
          '@md': { flexDirection: 'row' }
        }}
        space="md"
        p="$4"
        gap="$4"
      >
        <VStack space="md" sx={{ '@md': { flex: 7 } }}>
          {show.vpnInfo ? (
            <>
              <WireguardPeers flex={1} />
              <WireguardPeersActive flex={1} />
            </>
          ) : (
            <VStack space="md">
              {interfaces.map((iface) => (
                <Box
                  sx={{
                    '@base': { flexDirection: 'column', gap: '$3' },
                    '@md': { flexDirection: 'row', gap: '$3' }
                  }}
                  key={iface}
                >
                  <WifiInfo iface={iface} flex={1} />
                  <WifiClients iface={iface} flex={1} />
                </Box>
              ))}
            </VStack>
          )}

          <VStack space="md">
            {show.traffic ? <TotalTraffic /> : null}

            <VStack space="md" sx={{ '@md': { flexDirection: 'row' } }}>
              <DeviceTraffic flex={1} minutes={5} />
              <DeviceTraffic flex={1} minutes={60} />
            </VStack>
          </VStack>
        </VStack>

        <VStack flex={3} space="md">
          <ServicesEnabled features={services} />
          {show.dns ? (
            <VStack space="md">
              {/*<DNSMetrics />
              <DNSBlockMetrics />
              <DNSBlockPercent />*/}
              <DNSBlockFullMetrics />
            </VStack>
          ) : null}
          {show.vpnSide ? <WireguardPeersActive /> : null}
          <Interfaces />
        </VStack>
      </Box>
    </ScrollView>
  )
}

export default Home
