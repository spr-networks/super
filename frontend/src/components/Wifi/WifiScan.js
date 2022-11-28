import React, { useContext, useEffect, useState } from 'react'

import { wifiAPI } from 'api'
import { AlertContext } from 'layouts/Admin'
import InputSelect from 'components/InputSelect'
import { prettySignal } from 'utils'
import Icon from 'FontAwesomeUtils'

import {
  Badge,
  Box,
  Button,
  Heading,
  IconButton,
  Stack,
  HStack,
  VStack,
  ScrollView,
  Spacer,
  Spinner,
  Text,
  useColorModeValue
} from 'native-base'
import { faWifi } from '@fortawesome/free-solid-svg-icons'

import { FlashList } from '@shopify/flash-list'

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
        <Text fontSize="xs">{JSON.stringify(item, null, '  ')}</Text>
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

  return (
    <Box
      bg={useColorModeValue('warmGray.50', 'blueGray.800')}
      rounded="md"
      width="100%"
      p={4}
      h={'100%'}
    >
      <HStack space={2}>
        <Box flex="2">
          {/*isOptionDisabled={(option) => option.disabled}*/}
          <InputSelect options={devsScan} value={iface} onChange={onChange} />
        </Box>

        <Button
          colorScheme="primary"
          leftIcon={<Icon icon={faWifi} />}
          onPress={() => scan(iface)}
        >
          Scan
        </Button>
      </HStack>

      <FlashList
        data={list}
        estimatedItemSize={100}
        renderItem={({ item }) => (
          <Box
            borderBottomWidth="1"
            _dark={{
              borderColor: 'muted.600'
            }}
            borderColor="muted.200"
            py="2"
          >
            <HStack
              w="100%"
              space={1}
              alignItems="center"
              justifyContent="space-between"
            >
              <VStack flex="2" space={2}>
                <Text bold onPress={(e) => triggerAlert(item)}>
                  {item.ssid}
                </Text>

                <Text color="muted.500" fontSize="sm">
                  {item.bssid}
                </Text>
              </VStack>

              <VStack flex="1" space={2} alignItems="flex-end">
                <HStack space={1} alignItems="center">
                  <Text color="muted.400" fontSize="xs">
                    Channel
                  </Text>
                  <Text>{item.primary_channel}</Text>
                </HStack>
                <HStack space={1} alignItems="center">
                  <Text
                    display={{ base: 'none', md: 'flex' }}
                    color="muted.400"
                    fontSize="xs"
                  >
                    Freq
                  </Text>
                  <Text>{Number(item.freq / 1e3).toFixed(2)} GHz</Text>
                </HStack>
              </VStack>

              <VStack flex="1" space={2} alignItems="flex-end">
                <HStack space={1} alignItems="center">
                  <Text color="muted.400" fontSize="xs">
                    Signal
                  </Text>
                  <Text>{prettySignal(item.signal_dbm)}</Text>
                </HStack>
                <HStack space={1}>
                  <Text color="muted.400" fontSize="xs">
                    Auth
                  </Text>
                  <Text>{item.authentication_suites || '-'}</Text>
                </HStack>
              </VStack>

              <VStack
                display={{ base: 'none', md: 'flex' }}
                flex="1"
                space={2}
                alignItems="flex-end"
              >
                {item.model ? (
                  <HStack space={1} alignItems="center">
                    <Text color="muted.400" fontSize="xs">
                      Model
                    </Text>
                    <Text>
                      {item.model} / {item.model_number}
                    </Text>
                  </HStack>
                ) : null}
                {item.device_name ? (
                  <HStack space={1} alignItems="center">
                    <Text color="muted.400" fontSize="xs">
                      Device Name
                    </Text>
                    <Text>{item.device_name}</Text>
                  </HStack>
                ) : null}
              </VStack>
            </HStack>
          </Box>
        )}
        keyExtractor={(item) => item.bssid}
      />

      {loading ? (
        <HStack space={1}>
          <Spinner accessibilityLabel="Loading logs" />
          <Text>Loading...</Text>
        </HStack>
      ) : null}
    </Box>
  )
}

export default WifiScan
