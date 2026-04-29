import React, { useContext, useState, useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { AppState, RefreshControl } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  Box,
  Button,
  ButtonIcon,
  ButtonText,
  CloseIcon,
  Icon,
  Text,
  VStack,
  ScrollView,
  HStack,
  Spinner
} from '@gluestack-ui/themed'
import { AlertCircleIcon } from 'lucide-react-native'
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
  const [pluginsConfig, setPluginsConfig] = useState({})
  const [interfaces, setInterfaces] = useState([])
  const [showIntro, setShowIntro] = useState(false)
  const [show, setShow] = useState({})

  const [criticalStatus, setCriticalStatus] = useState({})
  const [criticalToCheck, setCriticalToCheck] = useState([])
  const [processed, setIsProcessed] = useState(false)
  const [uplinkSwapWarning, setUplinkSwapWarning] = useState(null)

  const checkStatus = () => {
    if (context.isFeaturesInitialized === true) {
      let toCheck = context.isMeshNode ? [] : ['dns', 'dhcp']
      if (pluginsEnabled.includes('MESH')) {
        toCheck.push("mesh")
      }
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
        let url = `/dockerPS?service=${s}`
        if (s == 'mesh') {
          let meshConfig = pluginsConfig.filter(x => x.Name == 'MESH')
          if (meshConfig.length == 1) {
            url = `/dockerPS?service=${s}&compose_file=${meshConfig[0].ComposeFilePath}`
          }
        }
        api.get(url)
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
        setPluginsConfig(plugins)
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

  // On a fresh setup WAN/LAN port order might be misconfigured
  // If Uplink iface has no IPv4 and downlink iface holds an IP that's not a tiynet,
  // prompt 
  useEffect(() => {
    AsyncStorage.getItem('uplink-swap-dismissed').then((dismissed) => {
      if (JSON.parse(dismissed) === true) return
      Promise.all([
        wifiAPI.interfacesConfiguration(),
        wifiAPI.ipAddr(),
        api.get('/subnetConfig').catch(() => ({ TinyNets: [] }))
      ])
        .then(([ifaces, addrs, subnetConfig]) => {
          let uplink = ifaces.find(
            (i) => i.Type === 'Uplink' && i.Enabled === true && i.Subtype !== 'pppup'
          )
          if (!uplink) return

          let ip4Num = (ip) =>
            ip.split('.').reduce((a, b) => (a << 8) + parseInt(b), 0) >>> 0
          let ipInCidr = (ip, cidr) => {
            let [net, prefixStr] = cidr.split('/')
            let prefix = parseInt(prefixStr)
            if (!net || isNaN(prefix)) return false
            let mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0
            return (ip4Num(ip) & mask) === (ip4Num(net) & mask)
          }
          let tinynets = subnetConfig?.TinyNets || []
          let inAnyTinynet = (ip) => tinynets.some((cidr) => ipInCidr(ip, cidr))

          let ipFor = (name) => {
            let entry = addrs.find((a) => a.ifname === name)
            if (!entry || !entry.addr_info) return null
            return entry.addr_info.find((a) => a.family === 'inet')?.local || null
          }

          let uplinkIP = ipFor(uplink.Name)
          if (uplinkIP) return // uplink has IP, all good

          // uplink has no IP — look for a downlink iface with a non-tinynet IP
          let downlinkWithExternalIP = ifaces.find((i) => {
            if (i.Type === 'Uplink' || i.Enabled !== true) return false
            if (i.Name === uplink.Name) return false
            let ip = ipFor(i.Name)
            return ip && !inAnyTinynet(ip)
          })
          if (downlinkWithExternalIP) {
            setUplinkSwapWarning({
              uplink: uplink.Name,
              downlink: downlinkWithExternalIP.Name
            })
          }
        })
        .catch(() => {})
    })
  }, [])

  const dismissUplinkSwap = () => {
    AsyncStorage.setItem('uplink-swap-dismissed', JSON.stringify(true))
    setUplinkSwapWarning(null)
  }

  const autoFixUplinkSwap = () => {
    if (!uplinkSwapWarning) return
    const { uplink, downlink } = uplinkSwapWarning
    if (
      Platform.OS == 'web' &&
      !window.confirm(
        `Swap roles: ${uplink} → Downlink, ${downlink} → Uplink? ` +
          `Networking will restart and you may need to reconnect.`
      )
    ) {
      return
    }
    // Old uplink first → Downlink. Then promote the new one to Uplink.
    api
      .put('/link/config', { Name: uplink, Type: 'Downlink', Enabled: true })
      .then(() =>
        api.put('/link/config', { Name: downlink, Type: 'Uplink', Enabled: true })
      )
      .then(() => {
        alertContext.success(
          'Uplink swapped',
          `${downlink} is now the uplink. Reload after networking comes back up.`
        )
        setUplinkSwapWarning(null)
        // dismiss so the banner doesn't reappear before the new state propagates
        AsyncStorage.setItem('uplink-swap-dismissed', JSON.stringify(true))
      })
      .catch((e) =>
        alertContext.error('Auto-fix failed', e?.message || String(e))
      )
  }

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
      {uplinkSwapWarning ? (
        <HStack
          mx="$4"
          mt="$4"
          p="$3"
          space="sm"
          alignItems="center"
          borderWidth={1}
          borderColor="$amber400"
          bg="$amber50"
          sx={{ _dark: { bg: '$amber900', borderColor: '$amber600' } }}
          rounded="$md"
        >
          <Icon as={AlertCircleIcon} color="$amber600" />
          <VStack flex={1} space="xs">
            <Text fontWeight="$bold">Uplink may not be connected</Text>
            <Text size="sm">
              Configured uplink {uplinkSwapWarning.uplink} has no IP, but{' '}
              {uplinkSwapWarning.downlink} does. Cables on the WAN/LAN ports
              may be swapped.
            </Text>
          </VStack>
          <Button
            size="xs"
            action="primary"
            variant="solid"
            onPress={autoFixUplinkSwap}
          >
            <ButtonText>Auto-fix</ButtonText>
          </Button>
          <Button
            size="xs"
            variant="link"
            action="secondary"
            onPress={dismissUplinkSwap}
          >
            <ButtonIcon as={CloseIcon} />
          </Button>
        </HStack>
      ) : null}
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
          <ServicesEnabled
            features={services}
            isFeaturesInitialized={context.isFeaturesInitialized}
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
