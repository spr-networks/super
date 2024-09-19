import React, { useContext, useEffect, useState } from 'react'
import { Dimensions, Platform } from 'react-native'
import { wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import InputSelect from 'components/InputSelect'
import { prettySignal } from 'utils'

import {
  Box,
  Button,
  ButtonIcon,
  FlatList,
  HStack,
  VStack,
  ScrollView,
  Spinner,
  Text,
  View,
  ButtonText,
  ButtonSpinner
} from '@gluestack-ui/themed'

//import { FlashList } from '@shopify/flash-list'
import { WifiIcon } from 'lucide-react-native'
import { ListItem } from 'components/List'
import WifiSignal from './WifiSignal'

const WifiScan = (props) => {
  const context = useContext(AlertContext)

  const [iface, setIface] = useState('')
  const [devs, setDevs] = useState({})
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    wifiAPI.iwDev().then((devs) => {
      setDevs(devs)
      //setLoadedDevs(true)
    })
  }, [])

  const scan = (_iface) => {
    setLoading(true)

    //set interface up
    wifiAPI.ipLinkState(_iface, 'up').then(
      //then scan
      wifiAPI.iwScan(_iface).then((scanList) => {
        setList(scanList)
        setLoading(false)
      })
    )
  }

  const onChange = (value) => {
    setIface(value)
  }

  const triggerAlert = (item) => {
    context.alert(
      'info',
      'Scan',
      <ScrollView w="100%" h="400">
        <Text size="xs">{JSON.stringify(item, null, '  ')}</Text>
      </ScrollView>
    )
  }

  let devsScan = []
  let defaultDev = null
  for (let phy in devs) {
    for (let iface in devs[phy]) {
      let type = devs[phy][iface].type
      let label = `${iface} ${type}`

      devsScan.push({ value: iface, disabled: type.includes('AP'), label })
      if (!type.includes('AP')) {
        defaultDev = devsScan[devsScan.length - 1]
      }
    }
  }

  devsScan = devsScan.filter((dev) => !dev.disabled)
  if (devsScan.length && !iface) {
    setIface(devsScan[0].value)
  }

  let navbarHeight = 64
  let tabsHeight = 32

  let h =
    Platform.OS == 'web'
      ? Dimensions.get('window').height - navbarHeight - tabsHeight
      : '100%'

  return (
    <View flex={1}>
      <HStack
        space="md"
        bg="$backgroundCardLight"
        sx={{ _dark: { bg: '$backgroundCardDark' } }}
        p="$4"
      >
        <Box flex={2}>
          {/*isOptionDisabled={(option) => option.disabled}*/}
          <InputSelect options={devsScan} value={iface} onChange={onChange} />
        </Box>

        <Button action="primary" onPress={() => scan(iface)} disabled={loading}>
          <ButtonText>Scan</ButtonText>
          {loading ? (
            <ButtonSpinner ml="$2" />
          ) : (
            <ButtonIcon as={WifiIcon} ml="$2" />
          )}
        </Button>
      </HStack>

      {/*loading ? (
        <HStack
          space="sm"
          bg="$backgroundCardLight"
          sx={{ _dark: { bg: '$backgroundCardDark' } }}
          p="$4"
        >
          <Spinner accessibilityLabel="Scanning..." />
          <Text>Scanning...</Text>
        </HStack>
      ) : null*/}

      <FlatList
        data={list}
        estimatedItemSize={100}
        renderItem={({ item }) => (
          <ListItem>
            <VStack flex={2} space="sm">
              <HStack space="sm" alignItems="center">
                <WifiSignal signal={item.signal_dbm} size={20} />
                <Text bold onPress={(e) => triggerAlert(item)} isTruncated>
                  {item.ssid}
                </Text>
              </HStack>

              <Text color="$muted400" size="sm">
                {item.bssid}
              </Text>
            </VStack>

            <VStack flex={1} space="md" alignItems="flex-end">
              <HStack space="sm" alignItems="center">
                <Text color="$muted400" size="xs">
                  Channel
                </Text>
                <Text>{item.primary_channel}</Text>
              </HStack>
              <HStack space="sm" alignItems="center">
                <Text
                  sx={{
                    '@base': { display: 'none' },
                    '@md': { display: 'flex' }
                  }}
                  color="$muted400"
                  size="xs"
                >
                  Freq
                </Text>
                <Text size="sm">{Number(item.freq / 1e3).toFixed(2)} GHz</Text>
              </HStack>
            </VStack>

            <VStack flex={1} space="md" alignItems="flex-end">
              <HStack space="sm" alignItems="center">
                <Text
                  sx={{
                    '@base': { display: 'none' },
                    '@md': { display: 'flex' }
                  }}
                  color="$muted400"
                  size="xs"
                >
                  Signal
                </Text>
                <Text size="sm">{prettySignal(item.signal_dbm)}</Text>
              </HStack>

              <HStack space="sm">
                <Text
                  sx={{
                    '@base': { display: 'none' },
                    '@md': { display: 'flex' }
                  }}
                  color="$muted400"
                  size="xs"
                >
                  Auth
                </Text>
                <Text size="sm">{item.authentication_suites || '-'}</Text>
              </HStack>
            </VStack>

            <VStack
              flex={1}
              sx={{
                '@base': { display: 'none' },
                '@md': { display: 'flex', flex: 2 }
              }}
              space="md"
              alignItems="flex-end"
            >
              {item.model ? (
                <HStack space="sm" alignItems="center">
                  <Text color="$muted400" size="xs">
                    Model
                  </Text>
                  <Text size="sm">
                    {item.model} / {item.model_number}
                  </Text>
                </HStack>
              ) : null}
              {item.device_name ? (
                <HStack space="sm" alignItems="center">
                  <Text color="$muted400" size="xs">
                    Device Name
                  </Text>
                  <Text size="sm">{item.device_name}</Text>
                </HStack>
              ) : null}
            </VStack>
          </ListItem>
        )}
        keyExtractor={(item) => item.bssid}
      />
    </View>
  )
}

export default WifiScan
