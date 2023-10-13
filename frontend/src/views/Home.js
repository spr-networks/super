import React, { useContext, useState, useEffect } from 'react'
import { Box, VStack, ScrollView } from '@gluestack-ui/themed'
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

import { TotalTraffic } from 'components/Dashboard/TrafficWidgets'
import {
  DNSMetrics,
  DNSBlockMetrics,
  DNSBlockPercent
} from 'components/Dashboard/DNSMetricsWidgets'
import { ServicesEnabled } from 'components/Dashboard/ServicesWidgets'

const Home = (props) => {
  const [pluginsEnabled, setPluginsEnabled] = useState([])
  const [interfaces, setInterfaces] = useState([])
  const context = useContext(AppContext)

  useEffect(() => {
    pluginAPI
      .list()
      .then((plugins) =>
        setPluginsEnabled(
          plugins
            .filter((p) => p.Enabled)
            .map((p) => p.Name.replace(/-extension/, ''))
        )
      )
      .catch((error) => error)
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
    vpn: context.isWifiDisabled,
    vpnSide: !context.isWifiDisabled && !context.isMeshNode,
    traffic: !context.isMeshNode
  }

  return (
    <ScrollView sx={{ '@md': { h: '90vh' } }}>
      <Box
        flexDirection="row"
        sx={{
          '@base': { flexDirection: 'column' },
          '@md': { flexDirection: 'row' }
        }}
        space="md"
        p="$4"
        gap="$4"
        mb="$8"
      >
        <VStack space="md" sx={{ '@md': { flex: 2 } }}>
          {show.vpn ? (
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
            <Interfaces />
          </VStack>
        </VStack>
        <VStack flex={1} space="md">
          <ServicesEnabled features={show} />
          {show.dns ? (
            <VStack space="md">
              <DNSMetrics />
              <DNSBlockMetrics />
              <DNSBlockPercent />
            </VStack>
          ) : null}
          {show.vpnSide ? <WireguardPeersActive /> : null}
        </VStack>
      </Box>
    </ScrollView>
  )
}

export default Home
