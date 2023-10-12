import React, { useContext, useState, useEffect } from 'react'
import {
  Box,
  Stack,
  HStack,
  VStack,
  ScrollView,
  useBreakpointValue
} from 'native-base'
import { AppContext, alertState } from 'AppContext'
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

  const flexDirection = useBreakpointValue({
    base: 'column',
    lg: 'row'
  })

  let show = {
    dns: pluginsEnabled.includes('dns-block') && !context.isMeshNode,
    vpn: context.isWifiDisabled,
    vpnSide: !context.isWifiDisabled && !context.isMeshNode,
    traffic: !context.isMeshNode
  }

  return (
    <ScrollView>
      <Stack direction={{ base: 'column', md: 'row' }}>
        <VStack flex={{ base: 1, md: 2 }} p={2}>
          <Stack
            direction={{ base: 'column', md: 'row' }}
            justifyContent="space-between"
            space={{ base: 0, md: 4 }}
          >
            {show.vpn ? (
              <>
                <WireguardPeers flex={1} />
                <WireguardPeersActive flex={1} />
              </>
            ) : (
              <VStack flex={1}>
                {interfaces.map((iface) => (
                  <Stack
                    direction={{ base: 'column', md: 'row' }}
                    flex={1}
                    space={{ base: 2, md: 4 }}
                    key={iface}
                  >
                    <WifiInfo iface={iface} flex={1} />
                    <WifiClients iface={iface} flex={1} />
                  </Stack>
                ))}
              </VStack>
            )}
          </Stack>

          <VStack>
            {show.traffic ? <TotalTraffic /> : null}

            <Interfaces />
          </VStack>
        </VStack>
        <VStack flex={1} p={2}>
          {show.dns ? (
            <VStack>
              <DNSMetrics />
              <DNSBlockMetrics />
              <DNSBlockPercent />
            </VStack>
          ) : null}
          {show.vpnSide ? <WireguardPeersActive /> : null}
        </VStack>
      </Stack>
    </ScrollView>
  )
}

export default Home
