import React, { useContext, useEffect, useState } from 'react'
import { Dimensions, Platform } from 'react-native'
import { deviceAPI, wifiAPI } from 'api'
import { useNavigate } from 'react-router-dom'
import Device from 'components/Devices/Device'
import { AlertContext } from 'layouts/Admin'
import { AppContext } from 'AppContext'
import Icon, { FontAwesomeIcon } from 'FontAwesomeUtils'
import {
  faCirclePlus,
  faEllipsis,
  faPlus,
  faTimes
} from '@fortawesome/free-solid-svg-icons'

import {
  Button,
  Box,
  Divider,
  Fab,
  Heading,
  IconButton,
  Stack,
  HStack,
  VStack,
  Pressable,
  ScrollView,
  Text,
  View,
  useColorModeValue
} from 'native-base'
import { FlashList } from "@shopify/flash-list";
//import { SwipeListView } from 'components/SwipeListView'

const DeviceListing = (props) => {
  const context = useContext(AlertContext)
  const appContext = useContext(AppContext)

  const [devices, setDevices] = useState(null)
  const navigate = useNavigate()
  const [groups, setGroups] = useState(['wan', 'dns', 'lan'])
  const [tags, setTags] = useState([])

  const refreshDevices = () => {
    deviceAPI
      .list()
      .then((devices) => {
        if (!devices) {
          return
        }

        let macs = Object.keys(devices).filter((id) => id.includes(':'))

        devices = Object.values(devices)
        setDevices(devices)

        // set device oui if avail
        deviceAPI
          .ouis(macs)
          .then((ouis) => {
            let devs = devices.map((d) => {
              let oui = ouis.find((o) => o.MAC == d.MAC)
              d.oui = oui ? oui.Vendor : ''
              return d
            })

            setDevices(devs)
          })
          .catch((err) => {})

        setGroups([...new Set(devices.map((device) => device.Groups).flat())])
        setTags([...new Set(devices.map((device) => device.DeviceTags).flat())])

        // TODO check wg status for virt
        if (!appContext.isWifiDisabled) {
          let iface = 'wlan1' // NOTE hardcoded
          wifiAPI
            .allStations(iface)
            .then((stations) => {
              let connectedMACs = Object.keys(stations)

              setDevices(
                devices.map((dev) => {
                  dev.isConnected = connectedMACs.includes(dev.MAC)
                  return dev
                })
              )
            })
            .catch((err) => {
              context.error('WIFI API Failure', err)
            })
        }
      })
      .catch((err) => {
        context.error('API Failure', err)
      })
  }

  useEffect(() => {
    refreshDevices()
  }, [])

  const handleRedirect = () => {
    if (appContext.isWifiDisabled) {
      navigate('/admin/wireguard')
    } else {
      navigate('/admin/add_device')
    }
  }

  const renderItem = ({ item }) => (
    <Device
      device={item}
      edit={true}
      groups={groups}
      tags={tags}
      notifyChange={refreshDevices}
    />
  )

  /*
  const closeRow = (rowMap, rowKey) => {
    if (rowMap[rowKey]) {
      rowMap[rowKey].closeRow()
    }
  }

  const deleteRow = (rowMap, rowKey) => {
    closeRow(rowMap, rowKey)
    const newData = [...devices]
    const prevIndex = devices.findIndex((item) => item.MAC === rowKey)
    newData.splice(prevIndex, 1)
    setDevices(newData)
  }

  const renderHiddenItem = (data, rowMap) => (
    <HStack flex="1" pl="2">
      <Pressable
        w="70"
        ml="auto"
        cursor="pointer"
        bg="coolGray.200"
        justifyContent="center"
        onPress={() => closeRow(rowMap, data.item.MAC)}
        _pressed={{
          opacity: 0.5
        }}
      >
        <VStack alignItems="center" space={2}>
          <Icon icon={faEllipsis} color="coolGray.800" />
          <Text fontSize="xs" fontWeight="medium" color="coolGray.800">
            More
          </Text>
        </VStack>
      </Pressable>
      <Pressable
        w="70"
        cursor="pointer"
        bg="red.500"
        justifyContent="center"
        onPress={() => deleteRow(rowMap, data.item.MAC)}
        _pressed={{
          opacity: 0.5
        }}
      >
        <VStack alignItems="center" space={2}>
          <Icon icon={faTimes} color="white" />
          <Text color="white" fontSize="xs" fontWeight="medium">
            Delete
          </Text>
        </VStack>
      </Pressable>
    </HStack>
  )
  */

  // TODO
  let navbarHeight = Platform.OS == 'ios' ? 64 * 2 : 64
  let h = Dimensions.get('window').height - navbarHeight

  return (
    <View h={h}>
      <HStack justifyContent="space-between" p={4}>
        <Heading fontSize="md" alignSelf="center">
          Configured Devices
        </Heading>

        <Button
          marginLeft="auto"
          size="sm"
          variant="ghost"
          colorScheme="blueGray"
          _rounded="lg"
          leftIcon={<Icon icon={faCirclePlus} />}
          onPress={handleRedirect}
        >
          Add Device
        </Button>
      </HStack>

      {/*<SwipeListView
        data={devices}
        renderItem={renderItem}
        renderHiddenItem={renderHiddenItem}
        rightOpenValue={-140}
      />*/}

      <Box
       bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
       >
      <FlashList
        data={devices}
        renderItem={renderItem}
        keyExtractor={(item, index) => item.Name + index}
        pb={{ md: 10 }}
      />
      </Box>
      {devices !== null && !devices.length ? (
        <Box
          bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
        >
          <Text color="muted.500" p={4}>
            There are no devices configured yet
          </Text>
        </Box>
      ) : null}

      <Fab
        renderInPortal={false}
        shadow={2}
        size="sm"
        icon={<Icon color="white" icon={faPlus} />}
        onPress={handleRedirect}
        bg={useColorModeValue('backgroundCardLight', 'backgroundCardDark')}
      />
    </View>
  )
}

export default DeviceListing
