import React, { useContext, useState, useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { AppState, RefreshControl } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  Box,
  Text,
  VStack,
  ScrollView,
  HStack,
  Spinner
} from '@gluestack-ui/themed'
import { AppContext, AlertContext } from 'AppContext'
import { pluginAPI, wifiAPI, api } from 'api'

import {
  WifiClients,
  Interfaces,
  WifiInfo
} from 'components/Dashboard/WifiWidgets'
import {
  WireguardPeers,
  WireguardPeersActive
} from 'components/Dashboard/WireguardWidgets'

import HealthCheck from 'components/Dashboard/HealthCheck'
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
import IntroWidget from 'components/Dashboard/Intro'

const Home = (props) => {
  const context = useContext(AppContext)
  const alertContext = useContext(AlertContext)

  const [pluginsEnabled, setPluginsEnabled] = useState([])
  const [interfaces, setInterfaces] = useState([])
  const [showIntro, setShowIntro] = useState(false)
  const [show, setShow] = useState({})

  const [criticalStatus, setCriticalStatus] = useState({})
  const [criticalToCheck, setCriticalToCheck] = useState([])
  const [processed, setIsProcessed] = useState(false)

  const checkStatus = () => {
    if (context.isFeaturesInitialized === true) {
      let toCheck = context.isMeshNode ? [] : ['dns', 'dhcp']
      if (!context.isWifiDisabled) {
        toCheck.push('wifid')
      }

      let counter = 0

      const complete = () => {
        counter += 1
        if (counter == toCheck.length) {
          setIsProcessed(true)
        }
      }

      toCheck.forEach((s, idx) => {
        api.get(`/dockerPS?service=${s}`)
          .then(() => {
            setCriticalStatus(prev => ({ ...prev, [s]: true }))
            complete()
            counter += 1
          })
          .catch(() => {
            setCriticalStatus(prev => ({ ...prev, [s]: false }))
            alertContext.warning(s + " service is not running")
            complete()
          })
      })


      setCriticalToCheck(toCheck)
    }
  }

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
    }, 340)
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

  useEffect(() => {
    AsyncStorage.getItem('intro-done')
      .then((res) => {
        //set to true when clicked
        if (JSON.parse(res) !== true) {
          setShowIntro(true)
        }
      })
      .catch((err) => {})
  }, [])

  useEffect(() => {
    checkStatus()
    let show_ = {
      dns: pluginsEnabled.includes('dns-block') && !context.isMeshNode ,
      wifi: !context.isWifiDisabled,
      vpnInfo: context.isWifiDisabled && context.features.includes('wireguard'),
      vpnSide:
        !context.isWifiDisabled &&
        !context.isMeshNode &&
        pluginsEnabled.includes('wireguard'),
      traffic: !context.isMeshNode,
      intro: showIntro && Platform.OS == 'web'
    }
    setShow(show_)
  }, [context.isWifiDisabled, context.isMeshNode, context.isFeaturesInitialized])


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
          {show.intro ? <IntroWidget /> : null}
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
          <ServicesEnabled features={services}
            isMeshNode={context.isMeshNode && context.isFeaturesInitialized}
            serviceStatus={criticalStatus}
          />
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
